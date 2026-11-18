#include "gm_plugin_lvgl_api.h"
#include "gm_plugin_libc.h"
#include "turtle_sprites.h"

#define SAMPLE_INTERVAL_MS       50U     /* IMU 샘플링 주기 (50ms) */
#define PITCH_THRESHOLD_DEG      25      /* 알람 기준 고개 숙임 각도 (정수) */
#define BAD_POSTURE_TIMEOUT_MS   3000U   /* 경고 발동까지 유지 시간 (3초) */
#define BLINK_INTERVAL_MS        400U    /* 깜빡임 주기 (0.4초 간격) */
#define SPRITE_ROW_BYTES         ((TURTLE_SPRITE_WIDTH + 1U) / 2U)

typedef struct {
    const gm_plugin_host_api_t *host;
    const gm_plugin_lvgl_api_t *ui;
    const gm_plugin_libc_extension_api_t *libc;
    
    gm_plugin_lvgl_obj_t *root;
    gm_plugin_lvgl_obj_t *title_label;
    gm_plugin_lvgl_obj_t *status_label;
    gm_plugin_lvgl_obj_t *warn_box;
    gm_plugin_lvgl_obj_t *warn_label;

    uint32_t sample_elapsed_ms;
    uint32_t blink_elapsed_ms;
    int current_pitch;
    uint32_t head_down_duration_ms;
    bool is_warning;
    bool is_box_visible;
} posture_guard_t;

static posture_guard_t s_app;
static const gm_plugin_libc_extension_api_t *s_libc;
static gm_plugin_display_info_t s_display;
static int16_t s_sprite_x;
static int16_t s_sprite_y;
static uint8_t s_sprite_pixels[SPRITE_ROW_BYTES * TURTLE_SPRITE_HEIGHT];
static bool s_was_warning = false;

static gm_plugin_lvgl_style_value_t font_val(const gm_plugin_lvgl_font_t *font) {
    gm_plugin_lvgl_style_value_t v = {0};
    v.ptr = font;
    return v;
}

static void decode_sprite(void) {
    const uint8_t *encoded = turtle_sprite_data;
    uint32_t encoded_size = turtle_sprite_size;
    uint32_t offset = 0U;
    uint32_t pixel = 0U;
    const uint32_t pixel_count = TURTLE_SPRITE_WIDTH * TURTLE_SPRITE_HEIGHT;

    while (offset + 1U < encoded_size && pixel < pixel_count) {
        uint32_t run = encoded[offset++];
        uint8_t gray = (uint8_t)(encoded[offset++] & 0x0FU);
        uint8_t packed = (uint8_t)((gray << 4) | gray);
        uint32_t bytes;
        if (run > pixel_count - pixel) run = pixel_count - pixel;
        if ((pixel & 1U) != 0U && run != 0U) {
            s_sprite_pixels[pixel >> 1] |= gray;
            ++pixel;
            --run;
        }
        bytes = run >> 1;
        if (bytes != 0U) {
            s_libc->memset(s_sprite_pixels + (pixel >> 1), packed, bytes);
            pixel += bytes << 1;
            run &= 1U;
        }
        if (run != 0U) {
            s_sprite_pixels[pixel >> 1] = (uint8_t)(gray << 4);
            ++pixel;
        }
    }
    if ((pixel & 1U) != 0U) {
        s_sprite_pixels[pixel >> 1] &= 0xF0U;
        ++pixel;
    }
    if (pixel < pixel_count)
        s_libc->memset(s_sprite_pixels + (pixel >> 1), 0, (pixel_count - pixel) >> 1);
}

static gm_plugin_result_t render_sprite(void) {
    uint16_t next_y = (uint16_t)s_sprite_y;
    uint16_t sprite_bottom = (uint16_t)(s_sprite_y + TURTLE_SPRITE_HEIGHT);

    while (next_y < sprite_bottom) {
        gm_plugin_framebuffer_surface_t surface;
        gm_plugin_rect_t dirty;
        uint32_t surface_end;
        uint16_t draw_top;
        uint16_t draw_bottom;
        uint16_t row;

        gm_plugin_result_t result = s_app.host->graphics.framebuffer.lock(next_y, &surface);
        if (result != GM_PLUGIN_OK) return result;

        surface_end = (uint32_t)surface.y + surface.height;
        if (surface.pixels == 0 || surface.height == 0U ||
            surface.y > next_y || surface_end <= next_y ||
            surface_end > s_display.height ||
            (uint32_t)s_sprite_x + TURTLE_SPRITE_WIDTH > surface.width ||
            surface.stride < (surface.width + 1U) / 2U) {
            (void)s_app.host->graphics.framebuffer.unlock(0, false);
            return GM_PLUGIN_ESTATE;
        }

        draw_top = surface.y > (uint16_t)s_sprite_y ? surface.y : (uint16_t)s_sprite_y;
        draw_bottom = (uint16_t)surface_end;
        if (draw_bottom > sprite_bottom) draw_bottom = sprite_bottom;
        if (draw_top >= draw_bottom) {
            (void)s_app.host->graphics.framebuffer.unlock(0, false);
            return GM_PLUGIN_ESTATE;
        }

        for (row = draw_top; row < draw_bottom; ++row) {
            const uint8_t *source = s_sprite_pixels +
                (uint32_t)(row - (uint16_t)s_sprite_y) * SPRITE_ROW_BYTES;
            uint8_t *target = surface.pixels +
                (uint32_t)(row - surface.y) * surface.stride +
                ((uint16_t)s_sprite_x >> 1);
            s_app.libc->memcpy(target, source, SPRITE_ROW_BYTES);
        }

        dirty.x = s_sprite_x;
        dirty.y = (int16_t)draw_top;
        dirty.width = TURTLE_SPRITE_WIDTH;
        dirty.height = (uint16_t)(draw_bottom - draw_top);
        result = s_app.host->graphics.framebuffer.unlock(&dirty, draw_bottom == sprite_bottom);
        if (result != GM_PLUGIN_OK) return result;
        next_y = draw_bottom;
    }
    return GM_PLUGIN_OK;
}

/* 경고 해제 시 이미지 영역을 검은색(공백)으로 지워주는 함수 추가 */
static gm_plugin_result_t clear_sprite(void) {
    uint16_t next_y = (uint16_t)s_sprite_y;
    uint16_t sprite_bottom = (uint16_t)(s_sprite_y + TURTLE_SPRITE_HEIGHT);

    while (next_y < sprite_bottom) {
        gm_plugin_framebuffer_surface_t surface;
        gm_plugin_rect_t dirty;
        uint32_t surface_end;
        uint16_t draw_top;
        uint16_t draw_bottom;
        uint16_t row;

        gm_plugin_result_t result = s_app.host->graphics.framebuffer.lock(next_y, &surface);
        if (result != GM_PLUGIN_OK) return result;

        surface_end = (uint32_t)surface.y + surface.height;
        if (surface.pixels == 0 || surface.height == 0U ||
            surface.y > next_y || surface_end <= next_y ||
            surface_end > s_display.height ||
            (uint32_t)s_sprite_x + TURTLE_SPRITE_WIDTH > surface.width ||
            surface.stride < (surface.width + 1U) / 2U) {
            (void)s_app.host->graphics.framebuffer.unlock(0, false);
            return GM_PLUGIN_ESTATE;
        }

        draw_top = surface.y > (uint16_t)s_sprite_y ? surface.y : (uint16_t)s_sprite_y;
        draw_bottom = (uint16_t)surface_end;
        if (draw_bottom > sprite_bottom) draw_bottom = sprite_bottom;
        if (draw_top >= draw_bottom) {
            (void)s_app.host->graphics.framebuffer.unlock(0, false);
            return GM_PLUGIN_ESTATE;
        }

        for (row = draw_top; row < draw_bottom; ++row) {
            uint8_t *target = surface.pixels +
                (uint32_t)(row - surface.y) * surface.stride +
                ((uint16_t)s_sprite_x >> 1);
            s_app.libc->memset(target, 0, SPRITE_ROW_BYTES);
        }

        dirty.x = s_sprite_x;
        dirty.y = (int16_t)draw_top;
        dirty.width = TURTLE_SPRITE_WIDTH;
        dirty.height = (uint16_t)(draw_bottom - draw_top);
        result = s_app.host->graphics.framebuffer.unlock(&dirty, draw_bottom == sprite_bottom);
        if (result != GM_PLUGIN_OK) return result;
        next_y = draw_bottom;
    }
    return GM_PLUGIN_OK;
}

static void update_display(posture_guard_t *self) {
    char buf[64];
    self->libc->snprintf(buf, sizeof(buf), "현재 Pitch: %d도", self->current_pitch);
    self->ui->label_set_text(self->status_label, buf);

    if (self->is_warning) {
        self->ui->obj_clear_flag(self->title_label, GM_PLUGIN_LVGL_FLAG_HIDDEN);
        self->ui->obj_clear_flag(self->status_label, GM_PLUGIN_LVGL_FLAG_HIDDEN);

        if (self->is_box_visible) {
            self->ui->obj_clear_flag(self->warn_box, GM_PLUGIN_LVGL_FLAG_HIDDEN);
        } else {
            self->ui->obj_add_flag(self->warn_box, GM_PLUGIN_LVGL_FLAG_HIDDEN);
        }
        self->ui->label_set_text(self->warn_label, "경고: 거북목 자세 교정!");

        (void)render_sprite();
        s_was_warning = true;
    } else {
        self->ui->obj_add_flag(self->title_label, GM_PLUGIN_LVGL_FLAG_HIDDEN);
        self->ui->obj_add_flag(self->status_label, GM_PLUGIN_LVGL_FLAG_HIDDEN);
        self->ui->obj_add_flag(self->warn_box, GM_PLUGIN_LVGL_FLAG_HIDDEN);
        self->is_box_visible = true;

        /* 경고 상태에서 정상 자세로 돌아올 때 이미지를 1회 깔끔하게 지움 */
        if (s_was_warning) {
            (void)clear_sprite();
            s_was_warning = false;
        }
    }
}

static gm_plugin_result_t init_ui(posture_guard_t *self) {
    if (self->host->display_get_info(&s_display) != GM_PLUGIN_OK ||
        s_display.pixel_format != GM_PLUGIN_PIXEL_GRAY_4 ||
        s_display.width < TURTLE_SPRITE_WIDTH ||
        s_display.height < TURTLE_SPRITE_HEIGHT)
        return GM_PLUGIN_ENOTSUP;

    s_sprite_x = (s_display.width >= TURTLE_SPRITE_WIDTH) ? (int16_t)((s_display.width - TURTLE_SPRITE_WIDTH) / 2U) : 0;
    s_sprite_y = 10;

    decode_sprite();

    self->root = self->ui->root_get();
    if (!self->root) return GM_PLUGIN_ENOTSUP;
    self->ui->obj_clean(self->root);

    self->title_label = self->ui->label_create(self->root);
    self->ui->label_set_text(self->title_label, "스마트 자세 코칭");
    self->ui->style_set(self->title_label, GM_PLUGIN_LVGL_STYLE_TEXT_FONT, 
                        font_val(self->ui->font_large), GM_PLUGIN_LVGL_SELECTOR_MAIN);
    self->ui->obj_align(self->title_label, GM_PLUGIN_LVGL_ALIGN_TOP_MID, 0, 140);

    self->status_label = self->ui->label_create(self->root);
    self->ui->style_set(self->status_label, GM_PLUGIN_LVGL_STYLE_TEXT_FONT, 
                        font_val(self->ui->font_default), GM_PLUGIN_LVGL_SELECTOR_MAIN);
    self->ui->obj_align(self->status_label, GM_PLUGIN_LVGL_ALIGN_TOP_MID, 0, 180);

    self->warn_box = self->ui->obj_create(self->root);
    self->ui->obj_set_size(self->warn_box, 520, 80);
    self->ui->style_set(self->warn_box, GM_PLUGIN_LVGL_STYLE_BG_COLOR, 
                        gm_plugin_lvgl_style_color(0xFF), GM_PLUGIN_LVGL_SELECTOR_MAIN);
    self->ui->style_set(self->warn_box, GM_PLUGIN_LVGL_STYLE_RADIUS, 
                        gm_plugin_lvgl_style_number(8), GM_PLUGIN_LVGL_SELECTOR_MAIN);
    self->ui->obj_align(self->warn_box, GM_PLUGIN_LVGL_ALIGN_TOP_MID, 0, 230);

    self->warn_label = self->ui->label_create(self->warn_box);
    self->ui->style_set(self->warn_label, GM_PLUGIN_LVGL_STYLE_TEXT_COLOR,
                        gm_plugin_lvgl_style_color(0x00), GM_PLUGIN_LVGL_SELECTOR_MAIN);
    self->ui->style_set(self->warn_label, GM_PLUGIN_LVGL_STYLE_TEXT_FONT, 
                        font_val(self->ui->font_large), GM_PLUGIN_LVGL_SELECTOR_MAIN);
    self->ui->obj_align(self->warn_label, GM_PLUGIN_LVGL_ALIGN_CENTER, 0, 0);

    update_display(self);
    return GM_PLUGIN_OK;
}

static gm_plugin_result_t on_start(void *context) {
    posture_guard_t *self = (posture_guard_t *)context;
    self->sample_elapsed_ms = 0;
    self->blink_elapsed_ms = 0;
    self->current_pitch = 0;
    self->head_down_duration_ms = 0;
    self->is_warning = false;
    self->is_box_visible = true;
    s_was_warning = false;
    self->libc = s_libc;

    if (init_ui(self) != GM_PLUGIN_OK) return GM_PLUGIN_ENOMEM;

    return self->host->imu_enable(GM_PLUGIN_IMU_ENABLE_GESTURES | GM_PLUGIN_IMU_ENABLE_RAW);
}

static void on_loop(void *context, uint32_t elapsed_ms) {
    posture_guard_t *self = (posture_guard_t *)context;
    gm_plugin_imu_sample_t sample;

    self->sample_elapsed_ms += elapsed_ms;
    if (self->sample_elapsed_ms >= SAMPLE_INTERVAL_MS) {
        self->sample_elapsed_ms = 0;
        if (self->host->imu_read(&sample) == GM_PLUGIN_OK) {
            self->current_pitch = (int)sample.pitch_degrees;
        }
    }

    if (self->current_pitch < -PITCH_THRESHOLD_DEG || self->current_pitch > PITCH_THRESHOLD_DEG) {
        self->head_down_duration_ms += elapsed_ms;

        if (self->head_down_duration_ms >= BAD_POSTURE_TIMEOUT_MS) {
            if (!self->is_warning) {
                self->is_warning = true;
                self->host->display_control.screen_turn_on(true);
            }
            
            self->blink_elapsed_ms += elapsed_ms;
            if (self->blink_elapsed_ms >= BLINK_INTERVAL_MS) {
                self->blink_elapsed_ms = 0;
                self->is_box_visible = !self->is_box_visible;
            }
        }
    } else {
        self->head_down_duration_ms = 0;
        self->is_warning = false;
        self->is_box_visible = true;
        self->blink_elapsed_ms = 0;
    }

    update_display(self);
}

static bool on_event(void *context, const gm_plugin_event_t *event) {
    posture_guard_t *self = (posture_guard_t *)context;
    if (!event) return false;

    if (event->type == GM_PLUGIN_EVENT_BUTTON) {
        if (event->data.button.action == GM_PLUGIN_BUTTON_ACTION_LONG ||
            event->data.button.button == GM_PLUGIN_BUTTON_BACK) {
            self->host->app_exit();
            return true;
        }
    }
    return false;
}

static void on_stop(void *context) {
    posture_guard_t *self = (posture_guard_t *)context;
    (void)self->host->imu_enable(GM_PLUGIN_IMU_ENABLE_NONE);
    if (self->root) self->ui->obj_clean(self->root);
}

gm_plugin_result_t gm_plugin_entry(const gm_plugin_host_api_t *host, gm_plugin_descriptor_t *plugin) {
    const gm_plugin_capabilities_t required = GM_PLUGIN_CAP_BUTTON |
        GM_PLUGIN_CAP_IMU_EVENTS | GM_PLUGIN_CAP_IMU_RAW | GM_PLUGIN_CAP_DISPLAY_CONTROL |
        GM_PLUGIN_CAP_DISPLAY_BITMAP;

    if (host == 0 || plugin == 0 ||
        host->struct_size < GM_PLUGIN_HOST_API_MIN_SIZE ||
        plugin->struct_size < GM_PLUGIN_DESCRIPTOR_MIN_SIZE ||
        !GM_PLUGIN_VERSION_COMPATIBLE(host->abi_version, GM_PLUGIN_ABI_MIN_VERSION) ||
        (host->capabilities & required) != required ||
        host->display_get_info == 0 || host->graphics.lvgl == 0 ||
        host->graphics.framebuffer.lock == 0 || host->graphics.framebuffer.unlock == 0 ||
        host->imu_enable == 0 || host->imu_read == 0 || host->app_exit == 0)
        return GM_PLUGIN_ENOTSUP;

    s_app.host = host;
    s_app.ui = host->graphics.lvgl;
    if (gm_plugin_libc_get(host, &s_libc) != GM_PLUGIN_OK) return GM_PLUGIN_ENOTSUP;

    plugin->abi_version = GM_PLUGIN_ABI_MIN_VERSION;
    plugin->context = &s_app;
    plugin->on_start = on_start;
    plugin->on_loop = on_loop;
    plugin->on_event = on_event;
    plugin->on_stop = on_stop;
    return GM_PLUGIN_OK;
}
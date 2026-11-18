#include "gm_plugin_lvgl_api.h"
#include "gm_plugin_extensions.h"
#include "gm_plugin_libc.h"

#define gm_plugin_entry glow_messenger_entry
#include "../messenger_companion_glass/messenger_companion_glass.c"
#undef gm_plugin_entry

#define WEB_BRIDGE_MAX_ELEMENTS 16U
#define WEB_BRIDGE_PROTOCOL_VERSION 1U
#define WEB_BRIDGE_MAX_FRAME_TILES 256U
#define WEB_BRIDGE_FRAME_TIMEOUT_MS 5000U

enum {
    WEB_BRIDGE_CHANNEL_CLEAR = 1,
    WEB_BRIDGE_CHANNEL_TEXT,
    WEB_BRIDGE_CHANNEL_RECT,
    WEB_BRIDGE_CHANNEL_DELETE,
    WEB_BRIDGE_CHANNEL_LINE,
    WEB_BRIDGE_CHANNEL_BITMAP,
    WEB_BRIDGE_CHANNEL_BITMAP_LZ4,
    WEB_BRIDGE_CHANNEL_FRAME_BEGIN,
    WEB_BRIDGE_CHANNEL_FRAME_TILE_LZ4,
    WEB_BRIDGE_CHANNEL_BUTTON = 0x0100U,
    WEB_BRIDGE_CHANNEL_CONNECTION = 0x0103U,
    WEB_BRIDGE_CHANNEL_FRAME_STATUS = 0x0104U,
    WEB_BRIDGE_CHANNEL_DIRECTION = 0x4751U,
    WEB_BRIDGE_CHANNEL_MESSENGER = 0x4752U,
    WEB_BRIDGE_CHANNEL_FAST_FRAME = 0x4D46U,
    WEB_BRIDGE_CHANNEL_FAST_FRAME_ACK = 0x4D47U,
    WEB_BRIDGE_CHANNEL_PING = 0x7FFEU,
};

enum {
    WEB_BRIDGE_EVENT_BUTTON = 1,
    WEB_BRIDGE_EVENT_CONNECTION = 4,
    WEB_BRIDGE_EVENT_FRAME_STATUS,
};

enum {
    FRAME_STATUS_OK = 0,
    FRAME_STATUS_INVALID_PAYLOAD,
    FRAME_STATUS_LZ4_UNAVAILABLE,
    FRAME_STATUS_DECODE_FAILED,
    FRAME_STATUS_OUT_OF_MEMORY,
    FRAME_STATUS_FRAMEBUFFER_FAILED,
    FRAME_STATUS_WRONG_FRAME,
    FRAME_STATUS_WRONG_TILE_INDEX,
    FRAME_STATUS_TIMEOUT,
};

enum {
    ELEMENT_NONE = 0,
    ELEMENT_TEXT,
    ELEMENT_RECT,
    ELEMENT_LINE,
};

typedef struct {
    uint8_t id;
    uint8_t type;
    gm_plugin_lvgl_obj_t *object;
    gm_plugin_lvgl_point_t points[2];
} web_bridge_element_t;

typedef struct {
    const gm_plugin_host_api_t *host;
    const gm_plugin_lvgl_api_t *lvgl;
    const gm_plugin_lz4_extension_api_t *lz4;
    const gm_plugin_libc_extension_api_t *libc;
    gm_plugin_lvgl_obj_t *root;
    uint8_t *decode_buffer;
    uint32_t decode_capacity;
    web_bridge_element_t elements[WEB_BRIDGE_MAX_ELEMENTS];
    uint32_t sequence;
    uint32_t frame_id;
    uint32_t frame_elapsed_ms;
    uint16_t frame_tile_count;
    uint16_t frame_next_tile;
    bool frame_active;
} web_bridge_context_t;

static web_bridge_context_t context;

#define style_number gm_plugin_lvgl_style_number
#define style_color gm_plugin_lvgl_style_color

static uint16_t read_u16(const uint8_t *data)
{
    return (uint16_t)(((uint16_t)data[0] << 8) | data[1]);
}

static uint32_t read_u32(const uint8_t *data)
{
    return ((uint32_t)data[0] << 24) | ((uint32_t)data[1] << 16) |
           ((uint32_t)data[2] << 8) | data[3];
}

static void write_u16(uint8_t *data, uint16_t value)
{
    data[0] = (uint8_t)(value >> 8);
    data[1] = (uint8_t)value;
}

static void write_u32(uint8_t *data, uint32_t value)
{
    data[0] = (uint8_t)(value >> 24);
    data[1] = (uint8_t)(value >> 16);
    data[2] = (uint8_t)(value >> 8);
    data[3] = (uint8_t)value;
}

static void write_event_header(web_bridge_context_t *self, uint8_t *data,
                               uint8_t event_type, uint32_t timestamp_ms)
{
    data[0] = WEB_BRIDGE_PROTOCOL_VERSION;
    data[1] = event_type;
    write_u32(data + 2, self->sequence++);
    write_u32(data + 6, timestamp_ms);
}

static bool send_event(web_bridge_context_t *self,
                       gm_plugin_bt_channel_t channel, const uint8_t *data,
                       uint32_t length)
{
    gm_plugin_result_t result = self->host->bt_send(channel, data, length);
    if (result != GM_PLUGIN_OK)
        self->host->log("web bridge send channel=%u failed=%d",
                        (unsigned int)channel, (int)result);
    return result == GM_PLUGIN_OK;
}

static bool send_button_event(web_bridge_context_t *self,
                              const gm_plugin_event_t *event)
{
    uint8_t payload[14];
    const uint16_t button = event->data.button.button;
    if (event->data.button.action == GM_PLUGIN_BUTTON_ACTION_TRIGGER &&
        button >= GM_PLUGIN_BUTTON_UP && button <= GM_PLUGIN_BUTTON_SCROLL_DOWN) {
        /* Send accessory navigation through the paired app's message scope. */
        write_u16(payload, button);
        return send_event(self, WEB_BRIDGE_CHANNEL_DIRECTION, payload, 2U);
    }
    write_event_header(self, payload, WEB_BRIDGE_EVENT_BUTTON,
                       event->timestamp_ms);
    write_u16(payload + 10, button);
    write_u16(payload + 12, event->data.button.action);
    (void)send_event(self, WEB_BRIDGE_CHANNEL_BUTTON, payload,
                     (uint32_t)sizeof(payload));
    return true;
}

static bool send_connection_event(web_bridge_context_t *self,
                                  const gm_plugin_event_t *event)
{
    uint8_t payload[11];
    if (!event->data.connection.connected) return true;
    write_event_header(self, payload, WEB_BRIDGE_EVENT_CONNECTION,
                       event->timestamp_ms);
    payload[10] = 1U;
    (void)send_event(self, WEB_BRIDGE_CHANNEL_CONNECTION, payload,
                     (uint32_t)sizeof(payload));
    return true;
}

static bool send_frame_status(web_bridge_context_t *self, uint32_t frame_id,
                              uint16_t tile_index, uint16_t next_index,
                              uint8_t status, bool complete)
{
    uint8_t payload[20];
    write_event_header(self, payload, WEB_BRIDGE_EVENT_FRAME_STATUS,
                       self->host->monotonic_ms());
    write_u32(payload + 10, frame_id);
    write_u16(payload + 14, tile_index);
    write_u16(payload + 16, next_index);
    payload[18] = status;
    payload[19] = complete ? 1U : 0U;
    return send_event(self, WEB_BRIDGE_CHANNEL_FRAME_STATUS, payload,
                      (uint32_t)sizeof(payload));
}

static void reset_element(web_bridge_context_t *self,
                          web_bridge_element_t *element)
{
    if (element->object != 0) self->lvgl->obj_delete(element->object);
    self->libc->memset(element, 0, sizeof(*element));
}

static void clear_scene(web_bridge_context_t *self)
{
    if (self->root != 0) self->lvgl->obj_clean(self->root);
    self->libc->memset(self->elements, 0, sizeof(self->elements));
}

static web_bridge_element_t *prepare_element(web_bridge_context_t *self,
                                             uint8_t id, uint8_t type)
{
    web_bridge_element_t *empty = 0;
    uint8_t index;
    for (index = 0; index < WEB_BRIDGE_MAX_ELEMENTS; ++index) {
        web_bridge_element_t *element = &self->elements[index];
        if (element->type == ELEMENT_NONE) {
            if (empty == 0) empty = element;
        } else if (element->id == id) {
            if (element->type == type) return element;
            reset_element(self, element);
            empty = element;
            break;
        }
    }
    if (empty != 0) {
        empty->id = id;
        empty->type = type;
    }
    return empty;
}

static void set_box(web_bridge_context_t *self,
                    gm_plugin_lvgl_obj_t *object, const uint8_t *data)
{
    self->lvgl->obj_set_pos(object, read_u16(data), read_u16(data + 2));
    self->lvgl->obj_set_size(object, read_u16(data + 4), read_u16(data + 6));
}

static void set_border(web_bridge_context_t *self,
                       gm_plugin_lvgl_obj_t *object, uint8_t width,
                       uint8_t radius)
{
    self->lvgl->style_set(object, GM_PLUGIN_LVGL_STYLE_BORDER_WIDTH,
                          style_number(width), 0);
    self->lvgl->style_set(object, GM_PLUGIN_LVGL_STYLE_RADIUS,
                          style_number(radius), 0);
}

static void draw_text(web_bridge_context_t *self, const uint8_t *data,
                      uint32_t length)
{
    web_bridge_element_t *element;
    char *text;
    uint32_t text_length;
    if (length < 11U) return;
    element = prepare_element(self, data[0], ELEMENT_TEXT);
    if (element == 0) return;
    if (element->object == 0) {
        element->object = self->lvgl->label_create(self->root);
        if (element->object == 0) {
            reset_element(self, element);
            return;
        }
        self->lvgl->label_set_long_mode(element->object,
                                        GM_PLUGIN_LVGL_LABEL_WRAP);
        self->lvgl->style_set(element->object,
                              GM_PLUGIN_LVGL_STYLE_BORDER_COLOR,
                              style_color(0xffU), 0);
        self->lvgl->style_set(element->object,
                              GM_PLUGIN_LVGL_STYLE_BORDER_OPA,
                              style_number(255), 0);
    }
    set_box(self, element->object, data + 1);
    set_border(self, element->object, data[9], data[10]);
    text_length = length - 11U;
    text = self->host->alloc(text_length + 1U);
    if (text == 0) return;
    self->libc->memcpy(text, data + 11U, text_length);
    text[text_length] = '\0';
    self->lvgl->label_set_text(element->object, text);
    self->host->free(text);
}

static void draw_rect(web_bridge_context_t *self, const uint8_t *data,
                      uint32_t length)
{
    web_bridge_element_t *element;
    if (length != 11U) return;
    element = prepare_element(self, data[0], ELEMENT_RECT);
    if (element == 0) return;
    if (element->object == 0) {
        element->object = self->lvgl->obj_create(self->root);
        if (element->object == 0) {
            reset_element(self, element);
            return;
        }
        self->lvgl->style_set(element->object, GM_PLUGIN_LVGL_STYLE_BG_OPA,
                              style_number(0), 0);
        self->lvgl->style_set(element->object,
                              GM_PLUGIN_LVGL_STYLE_BORDER_COLOR,
                              style_color(0xffU), 0);
        self->lvgl->style_set(element->object,
                              GM_PLUGIN_LVGL_STYLE_BORDER_OPA,
                              style_number(255), 0);
    }
    set_box(self, element->object, data + 1);
    set_border(self, element->object, data[9] == 0U ? 1U : data[9], data[10]);
}

static void delete_element(web_bridge_context_t *self, const uint8_t *data,
                           uint32_t length)
{
    uint8_t index;
    if (length != 1U) return;
    for (index = 0; index < WEB_BRIDGE_MAX_ELEMENTS; ++index) {
        if (self->elements[index].type != ELEMENT_NONE &&
            self->elements[index].id == data[0]) {
            reset_element(self, &self->elements[index]);
            return;
        }
    }
}

static void draw_line(web_bridge_context_t *self, const uint8_t *data,
                      uint32_t length)
{
    web_bridge_element_t *element;
    if (length != 10U) return;
    element = prepare_element(self, data[0], ELEMENT_LINE);
    if (element == 0) return;
    if (element->object == 0) {
        element->object = self->lvgl->line_create(self->root);
        if (element->object == 0) {
            reset_element(self, element);
            return;
        }
        self->lvgl->style_set(element->object, GM_PLUGIN_LVGL_STYLE_LINE_COLOR,
                              style_color(0xffU), 0);
        self->lvgl->style_set(element->object,
                              GM_PLUGIN_LVGL_STYLE_LINE_ROUNDED,
                              style_number(1), 0);
    }
    element->points[0].x = read_u16(data + 1);
    element->points[0].y = read_u16(data + 3);
    element->points[1].x = read_u16(data + 5);
    element->points[1].y = read_u16(data + 7);
    self->lvgl->line_set_points(element->object, element->points, 2);
    self->lvgl->style_set(element->object, GM_PLUGIN_LVGL_STYLE_LINE_WIDTH,
                          style_number(data[9] == 0U ? 1U : data[9]), 0);
}

static gm_plugin_result_t draw_bitmap(web_bridge_context_t *self,
                                      const uint8_t *data, uint32_t length,
                                      bool present)
{
    gm_plugin_framebuffer_surface_t surface;
    gm_plugin_rect_t destination;
    gm_plugin_display_info_t display;
    uint16_t stride;
    uint32_t byte_size;
    uint16_t next_y;
    uint16_t end_y;
    if (length < 10U) return GM_PLUGIN_EINVAL;
    destination.x = (int16_t)read_u16(data);
    destination.y = (int16_t)read_u16(data + 2);
    destination.width = read_u16(data + 4);
    destination.height = read_u16(data + 6);
    stride = read_u16(data + 8);
    byte_size = length - 10U;
    if (destination.width == 0U || destination.height == 0U ||
        stride < (destination.width + 1U) / 2U ||
        byte_size != (uint32_t)stride * destination.height)
        return GM_PLUGIN_EINVAL;
    if (destination.x < 0 || destination.y < 0 ||
        self->host->display_get_info(&display) != GM_PLUGIN_OK ||
        display.pixel_format != GM_PLUGIN_PIXEL_GRAY_4 ||
        (uint32_t)destination.x + destination.width > display.width ||
        (uint32_t)destination.y + destination.height > display.height)
        return GM_PLUGIN_EINVAL;

    next_y = (uint16_t)destination.y;
    end_y = (uint16_t)(destination.y + destination.height);
    while (next_y < end_y) {
        uint32_t surface_end;
        uint16_t part_end;
        uint32_t width;
        uint32_t row;
        gm_plugin_result_t result =
            self->host->graphics.framebuffer.lock(next_y, &surface);
        if (result != GM_PLUGIN_OK) return result;
        surface_end = (uint32_t)surface.y + surface.height;
        part_end = surface_end > end_y ? end_y : (uint16_t)surface_end;
        if (surface.pixels == 0 || surface.height == 0U ||
            surface.stride < (surface.width + 1U) / 2U ||
            surface.y > next_y || surface_end <= next_y ||
            surface_end > display.height || part_end <= next_y ||
            (uint32_t)destination.x + destination.width > surface.width) {
            (void)self->host->graphics.framebuffer.unlock(0, false);
            return GM_PLUGIN_EINVAL;
        }

        width = destination.width;
        if ((destination.x & 1) == 0 && (width & 1U) == 0U &&
            destination.x == 0 && width == surface.width &&
            stride == surface.stride) {
            uint32_t rows = (uint32_t)(part_end - next_y);
            const uint8_t *source = data + 10U +
                ((uint32_t)next_y - (uint16_t)destination.y) * stride;
            uint8_t *target = surface.pixels +
                ((uint32_t)next_y - surface.y) * surface.stride;
            self->libc->memcpy(target, source, rows * stride);
        } else {
            for (row = next_y; row < part_end; ++row) {
                const uint8_t *source = data + 10U +
                    (row - (uint16_t)destination.y) * stride;
                uint8_t *target = surface.pixels +
                    (row - surface.y) * surface.stride +
                    ((uint16_t)destination.x >> 1);
                if ((destination.x & 1) == 0) {
                    uint32_t bytes = width >> 1;
                    self->libc->memcpy(target, source, bytes);
                    if ((width & 1U) != 0U)
                        target[bytes] =
                            (uint8_t)((target[bytes] & 0x0FU) |
                                      (source[bytes] & 0xF0U));
                } else {
                    uint32_t pairs = (width - 1U) >> 1;
                    uint32_t index;
                    target[0] =
                        (uint8_t)((target[0] & 0xF0U) | (source[0] >> 4));
                    for (index = 0; index < pairs; ++index)
                        target[index + 1U] =
                            (uint8_t)((source[index] << 4) |
                                      (source[index + 1U] >> 4));
                    if ((width & 1U) == 0U)
                        target[pairs + 1U] =
                            (uint8_t)((target[pairs + 1U] & 0x0FU) |
                                      ((source[pairs] & 0x0FU) << 4));
                }
            }
        }

        gm_plugin_rect_t dirty = destination;
        dirty.y = (int16_t)next_y;
        dirty.height = (uint16_t)(part_end - next_y);
        result = self->host->graphics.framebuffer.unlock(
            &dirty, present && part_end == end_y);
        if (result != GM_PLUGIN_OK) return result;
        next_y = part_end;
    }
    return GM_PLUGIN_OK;
}

static uint8_t draw_bitmap_lz4(web_bridge_context_t *self,
                               const uint8_t *data, uint32_t length,
                               bool present)
{
    gm_plugin_display_info_t display;
    uint8_t *decoded;
    uint16_t x;
    uint16_t y;
    uint16_t width;
    uint16_t height;
    uint16_t stride;
    uint32_t decoded_size;
    uint32_t compressed_size;
    int32_t restored_size;

    gm_plugin_result_t draw_result;

    if (self->lz4 == 0) return FRAME_STATUS_LZ4_UNAVAILABLE;
    if (length <= 14U) return FRAME_STATUS_INVALID_PAYLOAD;
    x = read_u16(data);
    y = read_u16(data + 2);
    width = read_u16(data + 4);
    height = read_u16(data + 6);
    stride = read_u16(data + 8);
    decoded_size = read_u32(data + 10);
    compressed_size = length - 14U;
    if (width == 0U || height == 0U ||
        stride != (uint16_t)((width + 1U) / 2U) ||
        decoded_size != (uint32_t)stride * height ||
        decoded_size > UINT32_C(0x7fffffff) ||
        compressed_size > UINT32_C(0x7fffffff) ||
        self->host->display_get_info(&display) != GM_PLUGIN_OK ||
        (uint32_t)x + width > display.width ||
        (uint32_t)y + height > display.height)
        return FRAME_STATUS_INVALID_PAYLOAD;

    if (self->decode_capacity < decoded_size + 10U) {
        uint8_t *larger = self->host->alloc(decoded_size + 10U);
        if (larger == 0) return FRAME_STATUS_OUT_OF_MEMORY;
        if (self->decode_buffer != 0) self->host->free(self->decode_buffer);
        self->decode_buffer = larger;
        self->decode_capacity = decoded_size + 10U;
    }
    decoded = self->decode_buffer;
    if (decoded == 0) return FRAME_STATUS_OUT_OF_MEMORY;
    self->libc->memcpy(decoded, data, 10U);
    restored_size = self->lz4->decompress_safe(
        data + 14U, decoded + 10U, (int32_t)compressed_size,
        (int32_t)decoded_size);
    if (restored_size != (int32_t)decoded_size) {
        self->host->log("web bridge lz4 decode failed=%d",
                        (int)restored_size);
        return FRAME_STATUS_DECODE_FAILED;
    }
    draw_result = draw_bitmap(self, decoded, decoded_size + 10U, present);
    return draw_result == GM_PLUGIN_OK ? FRAME_STATUS_OK :
                                        FRAME_STATUS_FRAMEBUFFER_FAILED;
}

static void handle_frame_begin(web_bridge_context_t *self,
                               const uint8_t *data, uint32_t length)
{
    uint32_t frame_id = length >= 4U ? read_u32(data) : 0U;
    uint16_t tile_count = 0U;
    uint8_t status = FRAME_STATUS_OK;
    if (length != 6U) {
        status = FRAME_STATUS_INVALID_PAYLOAD;
    } else if (self->lz4 == 0) {
        status = FRAME_STATUS_LZ4_UNAVAILABLE;
    } else {
        tile_count = read_u16(data + 4);
        if (tile_count == 0U || tile_count > WEB_BRIDGE_MAX_FRAME_TILES) {
            status = FRAME_STATUS_INVALID_PAYLOAD;
        } else {
            /* Commit the new frame only after the complete begin message has
             * passed validation. A malformed retry must not cancel the frame
             * that is currently receiving tiles. */
            self->frame_id = frame_id;
            self->frame_tile_count = tile_count;
            self->frame_next_tile = 0;
            self->frame_elapsed_ms = 0;
            self->frame_active = true;
        }
    }
    (void)send_frame_status(self, frame_id, UINT16_MAX,
                            status == FRAME_STATUS_OK ? 0U : self->frame_next_tile,
                            status, false);
}

static void handle_frame_tile_lz4(web_bridge_context_t *self,
                                  const uint8_t *data, uint32_t length)
{
    uint32_t frame_id = length >= 4U ? read_u32(data) : 0U;
    uint16_t tile_index = length >= 6U ? read_u16(data + 4) : UINT16_MAX;
    uint8_t status;
    bool complete;
    bool last;

    if (length <= 20U) {
        (void)send_frame_status(self, frame_id, tile_index,
                                self->frame_next_tile,
                                FRAME_STATUS_INVALID_PAYLOAD, false);
        return;
    }
    complete = !self->frame_active && frame_id == self->frame_id &&
               self->frame_next_tile == self->frame_tile_count &&
               self->frame_tile_count != 0U;
    if (complete && tile_index < self->frame_next_tile) {
        (void)send_frame_status(self, frame_id, tile_index,
                                self->frame_next_tile, FRAME_STATUS_OK, true);
        return;
    }
    if (!self->frame_active || frame_id != self->frame_id) {
        (void)send_frame_status(self, frame_id, tile_index,
                                self->frame_next_tile,
                                FRAME_STATUS_WRONG_FRAME, false);
        return;
    }
    if (tile_index < self->frame_next_tile) {
        (void)send_frame_status(self, frame_id, tile_index,
                                self->frame_next_tile, FRAME_STATUS_OK, false);
        return;
    }
    if (tile_index != self->frame_next_tile) {
        (void)send_frame_status(self, frame_id, tile_index,
                                self->frame_next_tile,
                                FRAME_STATUS_WRONG_TILE_INDEX, false);
        return;
    }

    last = (uint32_t)tile_index + 1U == self->frame_tile_count;
    status = draw_bitmap_lz4(self, data + 6U, length - 6U, last);
    if (status == FRAME_STATUS_OK) {
        self->frame_elapsed_ms = 0;
        ++self->frame_next_tile;
        if (last) self->frame_active = false;
    }
    (void)send_frame_status(self, frame_id, tile_index,
                            self->frame_next_tile, status,
                            status == FRAME_STATUS_OK && last);
}

static gm_plugin_result_t web_bridge_start(void *opaque)
{
    web_bridge_context_t *self = opaque;
    self->root = self->lvgl->root_get();
    if (self->root == 0) return GM_PLUGIN_ESTATE;
    clear_scene(self);
    self->sequence = 0;
    self->frame_id = 0;
    self->frame_elapsed_ms = 0;
    self->frame_tile_count = 0;
    self->frame_next_tile = 0;
    self->frame_active = false;
    return GM_PLUGIN_OK;
}

static uint32_t battery_elapsed=10000U;
static void web_bridge_loop(void *opaque, uint32_t elapsed_ms)
{
    web_bridge_context_t *self = opaque;
    if (battery_elapsed < 10000U) battery_elapsed += elapsed_ms;
    if (battery_elapsed >= 10000U) {
        uint8_t battery[2]; battery_elapsed=0U;
        battery[0]=self->host->battery_percent ? self->host->battery_percent() : 255U;
        battery[1]=self->host->battery_charging ? (self->host->battery_charging()?1U:0U) : 0U;
        (void)send_event(self,0x4750U,battery,2U);
    }

    if (self->frame_active) {
        if (elapsed_ms >=
            WEB_BRIDGE_FRAME_TIMEOUT_MS - self->frame_elapsed_ms) {
            self->frame_active = false;
            self->frame_elapsed_ms = WEB_BRIDGE_FRAME_TIMEOUT_MS;
            (void)send_frame_status(self, self->frame_id,
                                    self->frame_next_tile,
                                    self->frame_next_tile,
                                    FRAME_STATUS_TIMEOUT, false);
        } else {
            self->frame_elapsed_ms += elapsed_ms;
        }
    }

}

static bool web_bridge_event(void *opaque, const gm_plugin_event_t *event)
{
    web_bridge_context_t *self = opaque;
    if (event == 0) return false;
    switch (event->type) {
    case GM_PLUGIN_EVENT_BT_MESSAGE:
        if (event->data.bt.length != 0U && event->data.bt.data == 0)
            return false;
        if (self->frame_active && event->data.bt.channel >= 1U &&
            event->data.bt.channel <= WEB_BRIDGE_CHANNEL_BITMAP_LZ4)
            return true;
        switch (event->data.bt.channel) {
        case WEB_BRIDGE_CHANNEL_FAST_FRAME: {
            const uint8_t *data = event->data.bt.data;
            const uint32_t length = event->data.bt.length;
            uint8_t ack[6];
            if (length < 19U || data[0] != 1U || read_u32(data + 15) > 79800U)
                return false;
            ack[0] = 1U;
            write_u32(ack + 1, read_u32(data + 1));
            ack[5] = self->frame_active ? FRAME_STATUS_WRONG_FRAME :
                draw_bitmap_lz4(self, data + 5, length - 5, true);
            return send_event(self, WEB_BRIDGE_CHANNEL_FAST_FRAME_ACK, ack, sizeof(ack));
        }
        case WEB_BRIDGE_CHANNEL_CLEAR:
            clear_scene(self);
            return true;
        case WEB_BRIDGE_CHANNEL_TEXT:
            draw_text(self, event->data.bt.data, event->data.bt.length);
            return true;
        case WEB_BRIDGE_CHANNEL_RECT:
            draw_rect(self, event->data.bt.data, event->data.bt.length);
            return true;
        case WEB_BRIDGE_CHANNEL_DELETE:
            delete_element(self, event->data.bt.data, event->data.bt.length);
            return true;
        case WEB_BRIDGE_CHANNEL_LINE:
            draw_line(self, event->data.bt.data, event->data.bt.length);
            return true;
        case WEB_BRIDGE_CHANNEL_BITMAP:
            (void)draw_bitmap(self, event->data.bt.data,
                              event->data.bt.length, true);
            return true;
        case WEB_BRIDGE_CHANNEL_BITMAP_LZ4:
            (void)draw_bitmap_lz4(self, event->data.bt.data,
                                  event->data.bt.length, true);
            return true;
        case WEB_BRIDGE_CHANNEL_FRAME_BEGIN:
            handle_frame_begin(self, event->data.bt.data,
                               event->data.bt.length);
            return true;
        case WEB_BRIDGE_CHANNEL_FRAME_TILE_LZ4:
            handle_frame_tile_lz4(self, event->data.bt.data,
                                  event->data.bt.length);
            return true;
        case WEB_BRIDGE_CHANNEL_PING:
            return send_event(self, WEB_BRIDGE_CHANNEL_PING,
                              event->data.bt.data, event->data.bt.length);
        default:
            return false;
        }
    case GM_PLUGIN_EVENT_BUTTON:
        return send_button_event(self, event);
    case GM_PLUGIN_EVENT_CONNECTION:
        if (!event->data.connection.connected) self->frame_active = false;
        return send_connection_event(self, event);
    default:
        return false;
    }
}

static void web_bridge_stop(void *opaque)
{
    web_bridge_context_t *self = opaque;
    clear_scene(self);
    if (self->decode_buffer != 0) self->host->free(self->decode_buffer);
    self->root = 0;
    self->decode_buffer = 0;
    self->decode_capacity = 0;
    self->frame_active = false;
}

static gm_plugin_descriptor_t messenger = {.struct_size = sizeof(gm_plugin_descriptor_t)};
static bool messenger_active;

static bool glow_event(void *opaque, const gm_plugin_event_t *event)
{
    web_bridge_context_t *self = opaque;
    if (!event) return false;
    if (event->type == GM_PLUGIN_EVENT_BT_MESSAGE &&
        event->data.bt.channel == WEB_BRIDGE_CHANNEL_MESSENGER) {
        if (event->data.bt.length != 1U || !event->data.bt.data || event->data.bt.data[0] > 1U)
            return false;
        const bool enable = event->data.bt.data[0] == 1U;
        if (enable == messenger_active) return true;
        if (enable) {
            web_bridge_stop(opaque);
            messenger_active = messenger.on_start(messenger.context) == GM_PLUGIN_OK;
            if (!messenger_active) (void)web_bridge_start(opaque);
            return messenger_active;
        }
        messenger.on_stop(messenger.context);
        messenger_active = false;
        return web_bridge_start(opaque) == GM_PLUGIN_OK;
    }
    if (!messenger_active) return web_bridge_event(opaque, event);
    if (event->type == GM_PLUGIN_EVENT_CONNECTION)
        return web_bridge_event(opaque, event);
    if (event->type == GM_PLUGIN_EVENT_BUTTON &&
        ((event->data.button.button == GM_PLUGIN_BUTTON_HOME &&
          event->data.button.action == GM_PLUGIN_BUTTON_ACTION_TRIGGER) ||
         (event->data.button.button == GM_PLUGIN_BUTTON_PRIMARY &&
          event->data.button.action == GM_PLUGIN_BUTTON_ACTION_VERY_LONG))) {
        const uint8_t home = 2U;
        return send_event(self, WEB_BRIDGE_CHANNEL_MESSENGER, &home, 1U);
    }
    return messenger.on_event(messenger.context, event);
}

static void glow_suspend(void *opaque)
{
    (void)opaque;
    if (messenger_active) messenger.on_suspend(messenger.context);
}

static void glow_resume(void *opaque)
{
    (void)opaque;
    if (messenger_active) messenger.on_resume(messenger.context);
}

static void glow_stop(void *opaque)
{
    if (messenger_active) messenger.on_stop(messenger.context);
    messenger_active = false;
    web_bridge_stop(opaque);
}

gm_plugin_result_t gm_plugin_entry(const gm_plugin_host_api_t *host,
                                   gm_plugin_descriptor_t *plugin)
{
    const void *lz4_api = 0;
    const gm_plugin_capabilities_t required =
        GM_PLUGIN_CAP_DISPLAY_BITMAP | GM_PLUGIN_CAP_BLUETOOTH |
        GM_PLUGIN_CAP_BUTTON;
    if (host == 0 || plugin == 0 || host->log == 0 ||
        host->monotonic_ms == 0 || host->alloc == 0 ||
        host->free == 0 || host->display_get_info == 0 ||
        host->extension_get == 0 ||
        host->graphics.lvgl == 0 ||
        host->graphics.framebuffer.lock == 0 ||
        host->graphics.framebuffer.unlock == 0 || host->bt_send == 0 ||
        !GM_PLUGIN_VERSION_COMPATIBLE(host->abi_version,
                                      GM_PLUGIN_ABI_MIN_VERSION) ||
        host->struct_size < GM_PLUGIN_HOST_API_MIN_SIZE ||
        plugin->struct_size < GM_PLUGIN_DESCRIPTOR_MIN_SIZE ||
        (host->capabilities & required) != required)
        return GM_PLUGIN_ENOTSUP;

    context.host = host;
    context.lvgl = host->graphics.lvgl;
    context.lz4 = 0;
    context.libc = 0;
    if (context.lvgl->struct_size < GM_PLUGIN_LVGL_API_MIN_SIZE ||
        !GM_PLUGIN_VERSION_COMPATIBLE(context.lvgl->api_version,
                                      GM_PLUGIN_LVGL_API_MIN_VERSION))
        return GM_PLUGIN_EVERSION;

    if (host->extension_get != 0 &&
        host->extension_get(GM_PLUGIN_EXTENSION_LZ4, &lz4_api) ==
            GM_PLUGIN_OK &&
        lz4_api != 0) {
        const gm_plugin_lz4_extension_api_t *lz4 =
            (const gm_plugin_lz4_extension_api_t *)lz4_api;
        if (lz4->decompress_safe != 0) context.lz4 = lz4;
    }
    if (gm_plugin_libc_get(host, &context.libc) != GM_PLUGIN_OK)
        return GM_PLUGIN_ENOTSUP;

    const gm_plugin_result_t result = glow_messenger_entry(host, &messenger);
    if (result != GM_PLUGIN_OK) return result;
    plugin->abi_version = GM_PLUGIN_ABI_MIN_VERSION;
    plugin->context = &context;
    plugin->on_start = web_bridge_start;
    plugin->on_loop = web_bridge_loop;
    plugin->on_event = glow_event;
    plugin->on_suspend = glow_suspend;
    plugin->on_resume = glow_resume;
    plugin->on_stop = glow_stop;
    return GM_PLUGIN_OK;
}

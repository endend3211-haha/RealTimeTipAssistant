#include "gm_plugin_lvgl_api.h"
#include "gm_plugin.h"
#include "gm_plugin_libc.h"

#define HUD_WIDTH  640
#define HUD_HEIGHT 350

/* Color palette (LV_COLOR_DEPTH=8, green phosphor monochrome aesthetic) */
#define COLOR_BLACK         0x00U
#define COLOR_PHOSPHOR_BRIGHT 0x1FU  /* Full brightness #00FF66 */
#define COLOR_PHOSPHOR_DIM    0x0AU  /* Dimmed 45% #007A33 */

/* Bluetooth channel definitions */
enum {
    CHANNEL_HUD_DISPLAY = 1,
    CHANNEL_HUD_CONTROL = 2,
    CHANNEL_HUD_PING    = 0x7FFEU
};

/* Demo tip structures for Studio Simulator */
typedef struct {
    const char *header;
    const char *line1;
    const char *line2;
    const char *caption;
} hud_demo_tip_t;

static const hud_demo_tip_t s_demo_tips[] = {
    {
        "[웹 검색] 부산일보 · 11/16 22:33",
        "- ★ [중앙로365] 유럽의 폭염은 어째서 조롱거리가 되었나",
        "- ★ 요약: 기상이변과 대응 정책의 시사점 분석",
        "자막 | 설치가 되었나"
    },
    {
        "[이메일] 홍길동 대표 · 14:20",
        "- 📅 CM사업본부 27년 사업계획보고 1차 회의 안내",
        "- ★ 핵심: 주요 안건 사전 검토 및 예산안 확정 요청",
        "자막 | 네 내일 오후 회의 준비 완료했습니다"
    },
    {
        "[실시간 주식] 네이버 증권 · 15:30",
        "- ▲ 삼성전자 78,500원 (+1,200원, +1.55%)",
        "- ▶ 외국인/기관 동반 순매수세 전환 지속",
        "자막 | 오늘 코스피 시장 마감 지수 확인해줘"
    }
};
#define DEMO_TIPS_COUNT (sizeof(s_demo_tips) / sizeof(s_demo_tips[0]))

/* Built-in baremetal memory routines */
void *memcpy(void *dest, const void *src, size_t n);
void *memset(void *s, int c, size_t n);

void *memcpy(void *dest, const void *src, size_t n)
{
    uint8_t *d = (uint8_t *)dest;
    const uint8_t *s = (const uint8_t *)src;
    while (n--) *d++ = *s++;
    return dest;
}

void *memset(void *s, int c, size_t n)
{
    uint8_t *p = (uint8_t *)s;
    while (n--) *p++ = (uint8_t)c;
    return s;
}

static const gm_plugin_host_api_t *s_host;
static const gm_plugin_lvgl_api_t *s_lvgl;
static const gm_plugin_libc_extension_api_t *s_libc;

/* LVGL UI Objects */
static gm_plugin_lvgl_obj_t *s_screen;
static gm_plugin_lvgl_obj_t *s_header_label;
static gm_plugin_lvgl_obj_t *s_prev_tip_line1;
static gm_plugin_lvgl_obj_t *s_prev_tip_line2;
static gm_plugin_lvgl_obj_t *s_active_tip_line1;
static gm_plugin_lvgl_obj_t *s_active_tip_line2;
static gm_plugin_lvgl_obj_t *s_divider_line;
static gm_plugin_lvgl_obj_t *s_caption_label;

/* On-Glasses Quick Control Menu Objects */
static gm_plugin_lvgl_obj_t *s_menu_box;
static gm_plugin_lvgl_obj_t *s_menu_title;
static gm_plugin_lvgl_obj_t *s_menu_items[8];
static bool s_menu_visible = false;
static int s_menu_cursor = 0;

static const char *s_menu_labels[8] = {
    "[1] 실시간 청취 (STT) : ON",
    "[2] 웹 검색 팁         : ON",
    "[3] 이메일 팁           : ON",
    "[4] 뉴스 팁             : ON",
    "[5] 실시간 주식 팁     : ON",
    "[6] 캘린더 팁           : ON",
    "[7] 연락처 팁           : ON",
    "[8] 통화 요약 팁       : ON"
};
static bool s_switch_states[8] = { true, true, true, true, true, true, true, true };

/* Points for the 1px green divider line at y: 260 within 560x320 optical sweet spot */
static const gm_plugin_lvgl_point_t s_divider_points[2] = {
    { 20, 260 },
    { 580, 260 }
};

/* Teleprompter Roll-up Animation State */
static uint32_t s_demo_elapsed_ms = 0;
static uint32_t s_demo_step = 0;
static size_t s_demo_tip_index = 0;
static bool s_live_data_received = false;

/* Buffer for string formatting */
static char s_header_buf[128];
static char s_caption_buf[192];
static char s_line1_buf[192];
static char s_line2_buf[192];

static void send_control_packet(const char *target, bool value)
{
    char packet[128];
    uint32_t len = 0;
    if (s_host == 0 || s_host->bt_send == 0) return;

    /* Build JSON control command e.g. {"type":"CONTROL","target":"sttListening","value":true} */
    while (target[len] != '\0' && len < 64) len++;
    
    /* Simple direct buffer formatting */
    packet[0] = '{';
    packet[1] = '\"';
    packet[2] = 't'; packet[3] = 'a'; packet[4] = 'r'; packet[5] = 'g'; packet[6] = 'e'; packet[7] = 't';
    packet[8] = '\"'; packet[9] = ':'; packet[10] = '\"';
    uint32_t pos = 11;
    for (uint32_t i = 0; i < len; i++) {
        packet[pos++] = target[i];
    }
    packet[pos++] = '\"';
    packet[pos++] = ',';
    packet[pos++] = '\"';
    packet[pos++] = 'v'; packet[pos++] = 'a'; packet[pos++] = 'l'; packet[pos++] = 'u'; packet[pos++] = 'e';
    packet[pos++] = '\"'; packet[pos++] = ':';
    if (value) {
        packet[pos++] = 't'; packet[pos++] = 'r'; packet[pos++] = 'u'; packet[pos++] = 'e';
    } else {
        packet[pos++] = 'f'; packet[pos++] = 'a'; packet[pos++] = 'l'; packet[pos++] = 's'; packet[pos++] = 'e';
    }
    packet[pos++] = '}';
    packet[pos] = '\0';

    s_host->bt_send(CHANNEL_HUD_CONTROL, (const uint8_t *)packet, pos);
}

static void update_menu_ui(void)
{
    if (s_menu_box == 0) return;
    if (s_menu_visible) {
        s_lvgl->obj_clear_flag(s_menu_box, GM_PLUGIN_LVGL_FLAG_HIDDEN);
        for (int i = 0; i < 8; i++) {
            char item_buf[64];
            const char *state_str = s_switch_states[i] ? "ON" : "OFF";
            const char *prefix = (i == s_menu_cursor) ? "> " : "  ";
            
            /* Build display string */
            int p = 0;
            while (prefix[p]) { item_buf[p] = prefix[p]; p++; }
            int s = 0;
            while (s_menu_labels[i][s] && s_menu_labels[i][s] != ':') {
                item_buf[p++] = s_menu_labels[i][s++];
            }
            item_buf[p++] = ':'; item_buf[p++] = ' ';
            int v = 0;
            while (state_str[v]) { item_buf[p++] = state_str[v++]; }
            item_buf[p] = '\0';

            s_lvgl->label_set_text(s_menu_items[i], item_buf);
            if (i == s_menu_cursor) {
                s_lvgl->style_set(s_menu_items[i], GM_PLUGIN_LVGL_STYLE_TEXT_COLOR,
                                  gm_plugin_lvgl_style_color(COLOR_PHOSPHOR_BRIGHT), GM_PLUGIN_LVGL_SELECTOR_MAIN);
            } else {
                s_lvgl->style_set(s_menu_items[i], GM_PLUGIN_LVGL_STYLE_TEXT_COLOR,
                                  gm_plugin_lvgl_style_color(COLOR_PHOSPHOR_DIM), GM_PLUGIN_LVGL_SELECTOR_MAIN);
            }
        }
    } else {
        s_lvgl->obj_add_flag(s_menu_box, GM_PLUGIN_LVGL_FLAG_HIDDEN);
    }
}

static void toggle_menu_item(int index)
{
    if (index < 0 || index >= 8) return;
    s_switch_states[index] = !s_switch_states[index];
    const char *targets[8] = {
        "sttListening",
        "isWebSearchEnabled",
        "isEmailEnabled",
        "isNewsEnabled",
        "isStockEnabled",
        "isCalendarEnabled",
        "isContactsEnabled",
        "isCallEnabled"
    };
    send_control_packet(targets[index], s_switch_states[index]);
    update_menu_ui();
}

static void apply_hud_step(uint32_t step, const hud_demo_tip_t *tip)
{
    if (tip == 0) return;

    if (step == 0) {
        /* Line 1 roll-up: push Line 1 from bottom edge, update top header */
        s_lvgl->label_set_text(s_header_label, tip->header);
        s_lvgl->label_set_text(s_active_tip_line1, tip->line1);
        s_lvgl->label_set_text(s_active_tip_line2, "");
        s_lvgl->label_set_text(s_caption_label, tip->caption);
    } else if (step == 1) {
        /* Line 2 roll-up: push Line 2 upward from bottom edge, hold full brightness */
        s_lvgl->label_set_text(s_active_tip_line2, tip->line2);
    } else if (step == 2) {
        /* Previous tip push-up & dim: move active tip lines to dimmed upper zone */
        s_lvgl->label_set_text(s_prev_tip_line1, tip->line1);
        s_lvgl->label_set_text(s_prev_tip_line2, tip->line2);
    }
}

static gm_plugin_result_t plugin_start(void *context)
{
    (void)context;
    s_screen = s_lvgl->root_get();
    if (s_screen == 0) return GM_PLUGIN_ESTATE;

    /* Set 640x350 solid black background */
    s_lvgl->style_set(s_screen, GM_PLUGIN_LVGL_STYLE_BG_COLOR,
                      gm_plugin_lvgl_style_color(COLOR_BLACK), GM_PLUGIN_LVGL_SELECTOR_MAIN);
    s_lvgl->style_set(s_screen, GM_PLUGIN_LVGL_STYLE_BG_OPA,
                      gm_plugin_lvgl_style_number(GM_PLUGIN_LVGL_OPA_COVER), GM_PLUGIN_LVGL_SELECTOR_MAIN);

    /* 1. Top Dynamic Metadata Header (x: 24, y: 16, w: 556, h: 26) */
    s_header_label = s_lvgl->label_create(s_screen);
    if (s_header_label == 0) return GM_PLUGIN_ENOMEM;
    s_lvgl->obj_set_pos(s_header_label, 24, 16);
    s_lvgl->obj_set_size(s_header_label, 556, 26);
    s_lvgl->label_set_long_mode(s_header_label, GM_PLUGIN_LVGL_LABEL_CLIP);
    s_lvgl->style_set(s_header_label, GM_PLUGIN_LVGL_STYLE_TEXT_COLOR,
                      gm_plugin_lvgl_style_color(COLOR_PHOSPHOR_BRIGHT), GM_PLUGIN_LVGL_SELECTOR_MAIN);
    s_lvgl->label_set_text(s_header_label, "[MemoMind One HUD] 대화 청취 대기 중");

    /* 2. Stacked Teleprompter Tip Zone (x: 24, w: 556) */
    /* Previous pushed-up lines (Dimmed 45% alpha, phosphor green) */
    s_prev_tip_line1 = s_lvgl->label_create(s_screen);
    s_prev_tip_line2 = s_lvgl->label_create(s_screen);
    s_lvgl->obj_set_pos(s_prev_tip_line1, 24, 48);
    s_lvgl->obj_set_size(s_prev_tip_line1, 556, 26);
    s_lvgl->style_set(s_prev_tip_line1, GM_PLUGIN_LVGL_STYLE_TEXT_COLOR,
                      gm_plugin_lvgl_style_color(COLOR_PHOSPHOR_DIM), GM_PLUGIN_LVGL_SELECTOR_MAIN);
    s_lvgl->label_set_text(s_prev_tip_line1, "");

    s_lvgl->obj_set_pos(s_prev_tip_line2, 24, 76);
    s_lvgl->obj_set_size(s_prev_tip_line2, 556, 26);
    s_lvgl->style_set(s_prev_tip_line2, GM_PLUGIN_LVGL_STYLE_TEXT_COLOR,
                      gm_plugin_lvgl_style_color(COLOR_PHOSPHOR_DIM), GM_PLUGIN_LVGL_SELECTOR_MAIN);
    s_lvgl->label_set_text(s_prev_tip_line2, "");

    /* Active bright 2-line tip (full phosphor green brightness) */
    s_active_tip_line1 = s_lvgl->label_create(s_screen);
    s_active_tip_line2 = s_lvgl->label_create(s_screen);
    s_lvgl->obj_set_pos(s_active_tip_line1, 24, 118);
    s_lvgl->obj_set_size(s_active_tip_line1, 556, 32);
    s_lvgl->style_set(s_active_tip_line1, GM_PLUGIN_LVGL_STYLE_TEXT_COLOR,
                      gm_plugin_lvgl_style_color(COLOR_PHOSPHOR_BRIGHT), GM_PLUGIN_LVGL_SELECTOR_MAIN);
    s_lvgl->label_set_text(s_active_tip_line1, "- ★ 실시간 음성 분석 및 팁 피드가 연결되었습니다");

    s_lvgl->obj_set_pos(s_active_tip_line2, 24, 154);
    s_lvgl->obj_set_size(s_active_tip_line2, 556, 32);
    s_lvgl->style_set(s_active_tip_line2, GM_PLUGIN_LVGL_STYLE_TEXT_COLOR,
                      gm_plugin_lvgl_style_color(COLOR_PHOSPHOR_BRIGHT), GM_PLUGIN_LVGL_SELECTOR_MAIN);
    s_lvgl->label_set_text(s_active_tip_line2, "- ★ 자연스러운 대화 중 필요한 정보를 1초 단위로 표시합니다");

    /* 3. 1px Phosphor Green Divider Line at y: 260 */
    s_divider_line = s_lvgl->line_create(s_screen);
    if (s_divider_line != 0) {
        s_lvgl->line_set_points(s_divider_line, s_divider_points, 2);
        s_lvgl->style_set(s_divider_line, GM_PLUGIN_LVGL_STYLE_LINE_COLOR,
                          gm_plugin_lvgl_style_color(COLOR_PHOSPHOR_DIM), GM_PLUGIN_LVGL_SELECTOR_MAIN);
        s_lvgl->style_set(s_divider_line, GM_PLUGIN_LVGL_STYLE_LINE_WIDTH,
                          gm_plugin_lvgl_style_number(1), GM_PLUGIN_LVGL_SELECTOR_MAIN);
    }

    /* 4. Bottom Live Corrected Caption Bar (y: 270 to 326) */
    s_caption_label = s_lvgl->label_create(s_screen);
    if (s_caption_label != 0) {
        s_lvgl->obj_set_pos(s_caption_label, 24, 270);
        s_lvgl->obj_set_size(s_caption_label, 556, 50);
        s_lvgl->label_set_long_mode(s_caption_label, GM_PLUGIN_LVGL_LABEL_CLIP);
        s_lvgl->style_set(s_caption_label, GM_PLUGIN_LVGL_STYLE_TEXT_COLOR,
                          gm_plugin_lvgl_style_color(COLOR_PHOSPHOR_BRIGHT), GM_PLUGIN_LVGL_SELECTOR_MAIN);
        s_lvgl->label_set_text(s_caption_label, "자막 | 대화 청취 대기 중");
    }

    /* 5. On-Glasses Quick Control Menu Overlay (hidden by default) */
    s_menu_box = s_lvgl->obj_create(s_screen);
    if (s_menu_box != 0) {
        s_lvgl->obj_set_pos(s_menu_box, 80, 20);
        s_lvgl->obj_set_size(s_menu_box, 480, 310);
        s_lvgl->style_set(s_menu_box, GM_PLUGIN_LVGL_STYLE_BG_COLOR,
                          gm_plugin_lvgl_style_color(COLOR_BLACK), GM_PLUGIN_LVGL_SELECTOR_MAIN);
        s_lvgl->style_set(s_menu_box, GM_PLUGIN_LVGL_STYLE_BG_OPA,
                          gm_plugin_lvgl_style_number(GM_PLUGIN_LVGL_OPA_COVER), GM_PLUGIN_LVGL_SELECTOR_MAIN);
        s_lvgl->style_set(s_menu_box, GM_PLUGIN_LVGL_STYLE_BORDER_COLOR,
                          gm_plugin_lvgl_style_color(COLOR_PHOSPHOR_BRIGHT), GM_PLUGIN_LVGL_SELECTOR_MAIN);
        s_lvgl->style_set(s_menu_box, GM_PLUGIN_LVGL_STYLE_BORDER_WIDTH,
                          gm_plugin_lvgl_style_number(2), GM_PLUGIN_LVGL_SELECTOR_MAIN);

        s_menu_title = s_lvgl->label_create(s_menu_box);
        s_lvgl->obj_set_pos(s_menu_title, 16, 8);
        s_lvgl->style_set(s_menu_title, GM_PLUGIN_LVGL_STYLE_TEXT_COLOR,
                          gm_plugin_lvgl_style_color(COLOR_PHOSPHOR_BRIGHT), GM_PLUGIN_LVGL_SELECTOR_MAIN);
        s_lvgl->label_set_text(s_menu_title, "[ 빠른 설정 메뉴 - 글래스 제어 ]");

        for (int i = 0; i < 8; i++) {
            s_menu_items[i] = s_lvgl->label_create(s_menu_box);
            s_lvgl->obj_set_pos(s_menu_items[i], 16, 38 + (i * 32));
            s_lvgl->label_set_text(s_menu_items[i], s_menu_labels[i]);
            s_lvgl->style_set(s_menu_items[i], GM_PLUGIN_LVGL_STYLE_TEXT_COLOR,
                              gm_plugin_lvgl_style_color(COLOR_PHOSPHOR_DIM), GM_PLUGIN_LVGL_SELECTOR_MAIN);
        }
        s_lvgl->obj_add_flag(s_menu_box, GM_PLUGIN_LVGL_FLAG_HIDDEN);
    }

    s_demo_elapsed_ms = 0;
    s_demo_step = 0;
    s_demo_tip_index = 0;
    return GM_PLUGIN_OK;
}

static void plugin_loop(void *context, uint32_t elapsed_ms)
{
    (void)context;
    if (s_live_data_received) return; /* If live data is streaming from phone, disable demo loop */

    s_demo_elapsed_ms += elapsed_ms;

    /* Pacing: 1000ms (1 second) per line roll-up */
    if (s_demo_elapsed_ms >= 1000U) {
        s_demo_elapsed_ms = 0;
        apply_hud_step(s_demo_step, &s_demo_tips[s_demo_tip_index]);
        s_demo_step++;
        if (s_demo_step > 2) {
            s_demo_step = 0;
            s_demo_tip_index = (s_demo_tip_index + 1) % DEMO_TIPS_COUNT;
        }
    }
}

static bool plugin_event(void *opaque, const gm_plugin_event_t *event)
{
    (void)opaque;
    if (event == 0) return false;

    switch (event->type) {
    case GM_PLUGIN_EVENT_BUTTON: {
        gm_plugin_button_t btn = event->data.button.button;
        gm_plugin_button_action_t act = event->data.button.action;

        /* Toggle Menu with Double-Click or Back Button */
        if ((btn == GM_PLUGIN_BUTTON_PRIMARY && act == GM_PLUGIN_BUTTON_ACTION_DOUBLE) ||
            (btn == GM_PLUGIN_BUTTON_BACK && act == GM_PLUGIN_BUTTON_ACTION_TRIGGER)) {
            s_menu_visible = !s_menu_visible;
            update_menu_ui();
            return true;
        }

        /* Navigate menu with UP / DOWN, select with SINGLE click */
        if (s_menu_visible) {
            if ((btn == GM_PLUGIN_BUTTON_UP || btn == GM_PLUGIN_BUTTON_PAGE_UP) &&
                act == GM_PLUGIN_BUTTON_ACTION_TRIGGER) {
                s_menu_cursor = (s_menu_cursor + 7) % 8;
                update_menu_ui();
                return true;
            }
            if ((btn == GM_PLUGIN_BUTTON_DOWN || btn == GM_PLUGIN_BUTTON_PAGE_DOWN) &&
                act == GM_PLUGIN_BUTTON_ACTION_TRIGGER) {
                s_menu_cursor = (s_menu_cursor + 1) % 8;
                update_menu_ui();
                return true;
            }
            if (btn == GM_PLUGIN_BUTTON_PRIMARY && act == GM_PLUGIN_BUTTON_ACTION_SINGLE) {
                toggle_menu_item(s_menu_cursor);
                return true;
            }
        }
        return false;
    }
    case GM_PLUGIN_EVENT_BT_MESSAGE: {
        /* Parse incoming structured HUD display payload from Android companion app */
        const uint8_t *data = event->data.bt.data;
        uint32_t len = event->data.bt.length;
        if (data == 0 || len == 0) return false;

        s_live_data_received = true;

        /* Direct string format: header\nline1\nline2\ncaption */
        uint32_t line_starts[4] = { 0, 0, 0, 0 };
        int line_count = 0;
        for (uint32_t i = 0; i < len && line_count < 4; i++) {
            if (data[i] == '\n') {
                line_count++;
                if (line_count < 4) line_starts[line_count] = i + 1;
            }
        }

        /* Update UI with live stream */
        if (line_count >= 1 && s_header_label != 0) {
            uint32_t hlen = line_starts[1] - 1;
            if (hlen >= sizeof(s_header_buf)) hlen = sizeof(s_header_buf) - 1;
            for (uint32_t i = 0; i < hlen; i++) s_header_buf[i] = (char)data[i];
            s_header_buf[hlen] = '\0';
            s_lvgl->label_set_text(s_header_label, s_header_buf);
        }
        if (line_count >= 2 && s_active_tip_line1 != 0) {
            uint32_t l1len = (line_count >= 3 ? line_starts[2] - 1 : len) - line_starts[1];
            if (l1len >= sizeof(s_line1_buf)) l1len = sizeof(s_line1_buf) - 1;
            for (uint32_t i = 0; i < l1len; i++) s_line1_buf[i] = (char)data[line_starts[1] + i];
            s_line1_buf[l1len] = '\0';
            s_lvgl->label_set_text(s_active_tip_line1, s_line1_buf);
        }
        if (line_count >= 3 && s_active_tip_line2 != 0) {
            uint32_t l2len = (line_count >= 4 ? line_starts[3] - 1 : len) - line_starts[2];
            if (l2len >= sizeof(s_line2_buf)) l2len = sizeof(s_line2_buf) - 1;
            for (uint32_t i = 0; i < l2len; i++) s_line2_buf[i] = (char)data[line_starts[2] + i];
            s_line2_buf[l2len] = '\0';
            s_lvgl->label_set_text(s_active_tip_line2, s_line2_buf);
        }
        if (line_count >= 4 && s_caption_label != 0) {
            uint32_t clen = len - line_starts[3];
            if (clen >= sizeof(s_caption_buf)) clen = sizeof(s_caption_buf) - 1;
            for (uint32_t i = 0; i < clen; i++) s_caption_buf[i] = (char)data[line_starts[3] + i];
            s_caption_buf[clen] = '\0';
            s_lvgl->label_set_text(s_caption_label, s_caption_buf);
        }
        return true;
    }
    default:
        return false;
    }
}

static void plugin_stop(void *context)
{
    (void)context;
    if (s_lvgl != 0 && s_lvgl->root_get != 0) {
        s_lvgl->obj_clean(s_lvgl->root_get());
    }
    s_screen = 0;
    s_header_label = 0;
    s_prev_tip_line1 = 0;
    s_prev_tip_line2 = 0;
    s_active_tip_line1 = 0;
    s_active_tip_line2 = 0;
    s_divider_line = 0;
    s_caption_label = 0;
    s_menu_box = 0;
}

gm_plugin_result_t gm_plugin_entry(const gm_plugin_host_api_t *host,
                                   gm_plugin_descriptor_t *plugin)
{
    if (host == 0 || plugin == 0 ||
        !GM_PLUGIN_VERSION_COMPATIBLE(host->abi_version, GM_PLUGIN_ABI_MIN_VERSION) ||
        host->struct_size < GM_PLUGIN_HOST_API_MIN_SIZE ||
        host->graphics.lvgl == 0 ||
        plugin->struct_size < GM_PLUGIN_DESCRIPTOR_MIN_SIZE) {
        return GM_PLUGIN_EVERSION;
    }

    s_host = host;
    s_lvgl = host->graphics.lvgl;
    if (s_lvgl == 0 ||
        s_lvgl->struct_size < GM_PLUGIN_LVGL_API_MIN_SIZE ||
        !GM_PLUGIN_VERSION_COMPATIBLE(s_lvgl->api_version, GM_PLUGIN_LVGL_API_MIN_VERSION)) {
        return GM_PLUGIN_EVERSION;
    }

    (void)gm_plugin_libc_get(host, &s_libc);

    plugin->abi_version = GM_PLUGIN_ABI_MIN_VERSION;
    plugin->on_start = plugin_start;
    plugin->on_loop = plugin_loop;
    plugin->on_event = plugin_event;
    plugin->on_stop = plugin_stop;
    return GM_PLUGIN_OK;
}

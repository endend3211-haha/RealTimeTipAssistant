#include "gm_plugin_lvgl_api.h"
#include "gm_plugin_libc.h"

#define REPLY_CHANNEL 20051U
#define PROTOCOL_VERSION 2U
#define NOTIFICATION_ID_BYTES 64U
#define HEADER_BYTES (1U + NOTIFICATION_ID_BYTES)
#define MAX_TEXT (1024U - HEADER_BYTES)

typedef struct {
    const gm_plugin_host_api_t *host;
    const gm_plugin_lvgl_api_t *ui;
    const gm_plugin_libc_extension_api_t *libc;
    gm_plugin_lvgl_obj_t *root;
    gm_plugin_lvgl_obj_t *title;
    gm_plugin_lvgl_obj_t *body;
    gm_plugin_lvgl_obj_t *hint;
    uint8_t notification_id[NOTIFICATION_ID_BYTES];
    uint8_t reply_selected;
    uint8_t voice_active;
} messenger_reply_t;

static messenger_reply_t app;

#define color gm_plugin_lvgl_style_color
#define number gm_plugin_lvgl_style_number

static void style(messenger_reply_t *state, gm_plugin_lvgl_obj_t *object,
                  gm_plugin_lvgl_style_prop_t property,
                  gm_plugin_lvgl_style_value_t value) {
    state->ui->style_set(object, property, value, GM_PLUGIN_LVGL_SELECTOR_MAIN);
}

static gm_plugin_lvgl_obj_t *make_label(messenger_reply_t *state,
                                         gm_plugin_lvgl_obj_t *parent,
                                         const char *text) {
    gm_plugin_lvgl_obj_t *object = state->ui->label_create(parent);
    if (!object) return 0;
    state->ui->label_set_text(object, text);
    style(state, object, GM_PLUGIN_LVGL_STYLE_TEXT_COLOR, color(0xFF));
    style(state, object, GM_PLUGIN_LVGL_STYLE_TEXT_ALIGN,
          number(GM_PLUGIN_LVGL_TEXT_ALIGN_CENTER));
    return object;
}

static void set_hint(messenger_reply_t *state, const char *text) {
    if (state->hint) state->ui->label_set_text(state->hint, text);
}

static bool send_command(messenger_reply_t *state, uint8_t command) {
    uint8_t packet[2U + NOTIFICATION_ID_BYTES];
    packet[0] = PROTOCOL_VERSION;
    packet[1] = command;
    state->libc->memcpy(&packet[2], state->notification_id,
                        NOTIFICATION_ID_BYTES);
    return state->host->bt_send(REPLY_CHANNEL, packet, sizeof(packet)) ==
           GM_PLUGIN_OK;
}

static gm_plugin_result_t start(void *context) {
    messenger_reply_t *state = context;
    gm_plugin_display_info_t display;
    gm_plugin_lvgl_obj_t *host_root = state->ui->root_get();
    if (!host_root || state->host->display_get_info(&display) != GM_PLUGIN_OK) {
        return GM_PLUGIN_ESTATE;
    }

    state->ui->obj_clean(host_root);
    state->root = state->ui->obj_create(host_root);
    if (!state->root) return GM_PLUGIN_ENOMEM;
    state->ui->obj_set_size(state->root, display.width, display.height);
    state->ui->obj_align(state->root, GM_PLUGIN_LVGL_ALIGN_CENTER, 0, 0);
    style(state, state->root, GM_PLUGIN_LVGL_STYLE_BG_COLOR, color(0x00));
    style(state, state->root, GM_PLUGIN_LVGL_STYLE_BG_OPA, number(255));

    state->title = make_label(state, state->root, "메신저 알림");
    state->body = make_label(state, state->root, "휴대폰 메시지 대기 중");
    state->hint = make_label(state, state->root,
                             "방향: 메시지  한번: 답장  두번: 음성  길게: 전송");
    if (!state->title || !state->body || !state->hint) {
        state->ui->obj_clean(host_root);
        state->root = 0;
        state->title = 0;
        state->body = 0;
        state->hint = 0;
        return GM_PLUGIN_ENOMEM;
    }

    state->ui->obj_set_size(state->title, display.width - 20, 36);
    state->ui->obj_align(state->title, GM_PLUGIN_LVGL_ALIGN_TOP_MID, 0, 12);
    state->ui->obj_set_size(state->body, display.width - 30, 215);
    state->ui->obj_align(state->body, GM_PLUGIN_LVGL_ALIGN_CENTER, 0, -2);
    state->ui->obj_set_size(state->hint, display.width - 20, 42);
    state->ui->obj_align(state->hint, GM_PLUGIN_LVGL_ALIGN_BOTTOM_MID, 0, -10);
    state->reply_selected = 0U;
    state->voice_active = 0U;
    return GM_PLUGIN_OK;
}

static bool valid_utf8(const uint8_t *data, uint32_t length) {
    uint32_t i = 0U;
    while (i < length) {
        uint8_t first = data[i++];
        uint32_t remaining;
        uint32_t codepoint;
        uint32_t minimum;
        if (first == 0U) return false;
        if (first < 0x80U) continue;
        if ((first & 0xE0U) == 0xC0U) {
            remaining = 1U; codepoint = first & 0x1FU; minimum = 0x80U;
        } else if ((first & 0xF0U) == 0xE0U) {
            remaining = 2U; codepoint = first & 0x0FU; minimum = 0x800U;
        } else if ((first & 0xF8U) == 0xF0U) {
            remaining = 3U; codepoint = first & 0x07U; minimum = 0x10000U;
        } else return false;
        if (remaining > length - i) return false;
        while (remaining--) {
            uint8_t next = data[i++];
            if ((next & 0xC0U) != 0x80U) return false;
            codepoint = (codepoint << 6U) | (next & 0x3FU);
        }
        if (codepoint < minimum || codepoint > 0x10FFFFU ||
            (codepoint >= 0xD800U && codepoint <= 0xDFFFU)) return false;
    }
    return true;
}

static bool receive_text(messenger_reply_t *state,
                         const gm_plugin_event_t *event) {
    static char text[MAX_TEXT + 1U];
    const uint8_t *data = event->data.bt.data;
    uint32_t length = event->data.bt.length;
    uint32_t text_length;
    if (!data || length <= HEADER_BYTES || length > 1024U ||
        data[0] != PROTOCOL_VERSION) {
        set_hint(state, "잘못된 메시지 무시됨");
        return true;
    }
    text_length = length - HEADER_BYTES;
    if (!valid_utf8(&data[HEADER_BYTES], text_length)) {
        set_hint(state, "잘못된 UTF-8 메시지 무시됨");
        return true;
    }
    for (uint32_t i = 0U; i < NOTIFICATION_ID_BYTES; ++i) {
        if (state->notification_id[i] != data[1U + i]) {
            state->reply_selected = 0U;
            state->voice_active = 0U;
            break;
        }
    }
    state->libc->memcpy(state->notification_id, &data[1],
                        NOTIFICATION_ID_BYTES);
    state->libc->memcpy(text, &data[HEADER_BYTES], text_length);
    text[text_length] = '\0';
    state->ui->label_set_text(state->body, text);
    set_hint(state, "방향: 메시지  한번: 답장  두번: 음성  길게: 전송");
    if (state->host->log) {
        state->host->log("messenger text: channel=%u bytes=%u",
                         REPLY_CHANNEL, (unsigned int)text_length);
    }
    return true;
}

static bool on_event(void *context, const gm_plugin_event_t *event) {
    messenger_reply_t *state = context;
    if (!event) return false;

    if (event->type == GM_PLUGIN_EVENT_BT_MESSAGE &&
        event->data.bt.channel == REPLY_CHANNEL) {
        return receive_text(state, event);
    }
    if (event->type != GM_PLUGIN_EVENT_BUTTON) return false;
    if (!state->notification_id[0]) return true;

    if (event->data.button.button == GM_PLUGIN_BUTTON_BACK &&
        event->data.button.action == GM_PLUGIN_BUTTON_ACTION_TRIGGER) {
        if (!send_command(state, 4U)) {
            set_hint(state, "취소 요청 전송 실패");
            return true;
        }
        state->reply_selected = 0U;
        state->voice_active = 0U;
        set_hint(state, "답장 취소");
        return true;
    }

    if (event->data.button.action == GM_PLUGIN_BUTTON_ACTION_TRIGGER) {
        uint8_t command = 0U;
        if (event->data.button.button == GM_PLUGIN_BUTTON_UP || event->data.button.button == GM_PLUGIN_BUTTON_LEFT || event->data.button.button == GM_PLUGIN_BUTTON_PAGE_UP) command = 5U;
        if (event->data.button.button == GM_PLUGIN_BUTTON_DOWN || event->data.button.button == GM_PLUGIN_BUTTON_RIGHT || event->data.button.button == GM_PLUGIN_BUTTON_PAGE_DOWN) command = 6U;
        if (command) {
            if (!send_command(state, command)) set_hint(state, "메시지 이동 요청 실패");
            return true;
        }
    }
    if (event->data.button.button != GM_PLUGIN_BUTTON_PRIMARY) return false;
    switch (event->data.button.action) {
    case GM_PLUGIN_BUTTON_ACTION_SINGLE:
        if (!send_command(state, 1U)) {
            set_hint(state, "답장 요청 전송 실패");
            return true;
        }
        state->reply_selected = 1U;
        set_hint(state, "답장 선택됨. 두번 눌러 음성 입력");
        return true;
    case GM_PLUGIN_BUTTON_ACTION_DOUBLE:
        if (!state->reply_selected) {
            set_hint(state, "먼저 한번 눌러 답장을 선택하세요");
            return true;
        }
        if (!send_command(state, 2U)) {
            set_hint(state, "음성 요청 전송 실패");
            return true;
        }
        state->voice_active = state->voice_active ? 0U : 1U;
        set_hint(state, state->voice_active ? "음성 입력 중… 두번 눌러 완료"
                                            : "음성 입력 완료. 길게 눌러 전송");
        return true;
    case GM_PLUGIN_BUTTON_ACTION_LONG:
        if (!state->reply_selected) {
            set_hint(state, "먼저 한번 눌러 답장을 선택하세요");
            return true;
        }
        if (!send_command(state, 3U)) {
            set_hint(state, "전송 요청 실패");
            return true;
        }
        state->voice_active = 0U;
        set_hint(state, "답장 전송 요청");
        return true;
    default:
        return false;
    }
}

static void suspend(void *context) {
    messenger_reply_t *state = context;
    state->reply_selected = 0U;
    state->voice_active = 0U;
    set_hint(state, "일시 중지됨");
}

static void stop(void *context) {
    messenger_reply_t *state = context;
    gm_plugin_lvgl_obj_t *root = state->ui->root_get();
    if (root) state->ui->obj_clean(root);
    state->root = 0;
    state->title = 0;
    state->body = 0;
    state->hint = 0;
}

gm_plugin_result_t gm_plugin_entry(const gm_plugin_host_api_t *host,
                                   gm_plugin_descriptor_t *plugin) {
    uint32_t required = GM_PLUGIN_CAP_BUTTON | GM_PLUGIN_CAP_BLUETOOTH;
    if (!host || !plugin ||
        !GM_PLUGIN_VERSION_COMPATIBLE(host->abi_version,
                                      GM_PLUGIN_ABI_MIN_VERSION) ||
        host->struct_size < GM_PLUGIN_HOST_API_MIN_SIZE ||
        plugin->struct_size < GM_PLUGIN_DESCRIPTOR_MIN_SIZE ||
        !host->graphics.lvgl || !host->bt_send || !host->display_get_info ||
        (host->capabilities & required) != required) {
        return GM_PLUGIN_ENOTSUP;
    }
    app.host = host;
    app.ui = host->graphics.lvgl;
    if (app.ui->struct_size < GM_PLUGIN_LVGL_API_MIN_SIZE ||
        !GM_PLUGIN_VERSION_COMPATIBLE(app.ui->api_version,
                                      GM_PLUGIN_LVGL_API_MIN_VERSION)) {
        return GM_PLUGIN_EVERSION;
    }
    if (gm_plugin_libc_get(host, &app.libc) != GM_PLUGIN_OK) {
        return GM_PLUGIN_ENOTSUP;
    }
    plugin->abi_version = GM_PLUGIN_ABI_MIN_VERSION;
    plugin->context = &app;
    plugin->on_start = start;
    plugin->on_event = on_event;
    plugin->on_suspend = suspend;
    plugin->on_stop = stop;
    return GM_PLUGIN_OK;
}

#include "gm_plugin_lvgl_api.h"
#include "gm_plugin_libc.h"
#include "messenger_app_icons.h"

#define REPLY_CHANNEL 20051U
#define PROTOCOL_VERSION 2U
#define NOTIFICATION_ID_BYTES 64U
#define HEADER_BYTES (1U + NOTIFICATION_ID_BYTES)
#define MAX_TEXT (1024U - HEADER_BYTES)
#define LIST_ROWS 4U
#define ACTIONS_BOTTOM_OFFSET 56
#define HINT_HEIGHT 28
#define HINT_GAP 8
#define READER_HINT_BOTTOM_OFFSET (ACTIONS_BOTTOM_OFFSET + HINT_HEIGHT + HINT_GAP)
#define READER_BODY_TOP 51

typedef struct {
    const gm_plugin_host_api_t *host;
    const gm_plugin_lvgl_api_t *ui;
    const gm_plugin_libc_extension_api_t *libc;
    gm_plugin_lvgl_obj_t *root;
    gm_plugin_lvgl_obj_t *title;
    gm_plugin_lvgl_obj_t *body;
    gm_plugin_lvgl_obj_t *hint;
    gm_plugin_lvgl_obj_t *icon;
    gm_plugin_lvgl_obj_t *icon_image;
    gm_plugin_lvgl_obj_t *actions[3];
    gm_plugin_lvgl_obj_t *list;
    gm_plugin_lvgl_obj_t *list_title;
    gm_plugin_lvgl_obj_t *categories[3];
    gm_plugin_lvgl_obj_t *rows[LIST_ROWS];
    gm_plugin_lvgl_obj_t *row_icons[LIST_ROWS];
    gm_plugin_lvgl_obj_t *senders[LIST_ROWS];
    gm_plugin_lvgl_obj_t *times[LIST_ROWS];
    gm_plugin_lvgl_obj_t *previews[LIST_ROWS];
    gm_plugin_lvgl_obj_t *empty;
    int32_t display_height;
    uint8_t list_view;
    uint8_t notification_id[NOTIFICATION_ID_BYTES];
    uint8_t reply_selected;
    uint8_t voice_active;
    uint8_t reply_allowed;
    uint8_t reading;
    uint8_t sleeping;
} messenger_reply_t;

static messenger_reply_t app;

#define color gm_plugin_lvgl_style_color
#define number gm_plugin_lvgl_style_number

static const gm_plugin_lvgl_image_dsc_t *const category_icons[] = {
    &kakao_icon, &line_icon, &telegram_icon
};
static const char *const category_names[] = {"카카오톡", "LINE", "Telegram"};

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
    style(state,object,GM_PLUGIN_LVGL_STYLE_PAD_TOP,number(0));
    style(state,object,GM_PLUGIN_LVGL_STYLE_PAD_BOTTOM,number(0));
    style(state,object,GM_PLUGIN_LVGL_STYLE_PAD_LEFT,number(0));
    style(state,object,GM_PLUGIN_LVGL_STYLE_PAD_RIGHT,number(0));
    style(state, object, GM_PLUGIN_LVGL_STYLE_TEXT_COLOR, color(0xFF));
    style(state, object, GM_PLUGIN_LVGL_STYLE_TEXT_ALIGN,
          number(GM_PLUGIN_LVGL_TEXT_ALIGN_CENTER));
    return object;
}

static void set_hint(messenger_reply_t *state, const char *text) {
    if (state->hint) state->ui->label_set_text(state->hint, text);
}

static void visible(messenger_reply_t *state, gm_plugin_lvgl_obj_t *object, bool show) {
    if (!object) return;
    if (show) state->ui->obj_clear_flag(object, GM_PLUGIN_LVGL_FLAG_HIDDEN);
    else state->ui->obj_add_flag(object, GM_PLUGIN_LVGL_FLAG_HIDDEN);
}

static void set_list_view(messenger_reply_t *state, bool list) {
    state->list_view = list;
    visible(state, state->list, list);
    visible(state, state->title, !list);
    visible(state, state->body, !list);
    visible(state, state->icon, !list);
    visible(state, state->icon_image, false);
    state->ui->obj_set_pos(state->hint, 10,
        state->display_height - (list ? 25 : READER_HINT_BOTTOM_OFFSET));
    for (uint32_t i = 0; i < 3; ++i) visible(state, state->actions[i], !list);
}

static void set_button_hint(messenger_reply_t *state) {
    set_hint(state, state->voice_active ? "두번: 녹음 완료"
             : state->reading ? "한번: 다음 · 두번: 선택 · 길게: 본문 넘김"
             : "한번: 다음 · 두번: 이전 · 길게: 선택");
}

static void set_app_icon(messenger_reply_t *state, uint8_t app_code) {
    static const gm_plugin_lvgl_image_dsc_t *const icons[] = {
        0, &kakao_icon, &telegram_icon, &line_icon
    };
    static const char *const initials[] = { "M", "K", "T", "L" };
    if (app_code >= sizeof(icons) / sizeof(icons[0])) app_code = 0;

    if (state->icon_image && icons[app_code] &&
        state->ui->image_set_source(state->icon_image, icons[app_code]) == GM_PLUGIN_OK) {
        state->ui->obj_add_flag(state->icon, GM_PLUGIN_LVGL_FLAG_HIDDEN);
        state->ui->obj_clear_flag(state->icon_image, GM_PLUGIN_LVGL_FLAG_HIDDEN);
        return;
    }
    if (state->icon_image) {
        state->ui->obj_add_flag(state->icon_image, GM_PLUGIN_LVGL_FLAG_HIDDEN);
    }
    state->ui->label_set_text(state->icon, initials[app_code]);
    state->ui->obj_clear_flag(state->icon, GM_PLUGIN_LVGL_FLAG_HIDDEN);
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

static gm_plugin_lvgl_obj_t *line_label(messenger_reply_t *state, gm_plugin_lvgl_obj_t *parent,
    const char *text, int32_t x, int32_t y, int32_t width) {
    gm_plugin_lvgl_obj_t *label = make_label(state, parent, text);
    if (!label) return 0;
    state->ui->obj_set_pos(label, x, y);
    state->ui->obj_set_size(label, width, 24);
    state->ui->label_set_long_mode(label, GM_PLUGIN_LVGL_LABEL_DOT);
    style(state, label, GM_PLUGIN_LVGL_STYLE_TEXT_ALIGN, number(GM_PLUGIN_LVGL_TEXT_ALIGN_LEFT));
    return label;
}

static bool create_list(messenger_reply_t *state, int32_t width, int32_t height) {
    int32_t split = width / 4, row_width = width - split - 22, row_height = (height - 70) / LIST_ROWS;
    int32_t time_width = 148, text_left = 49;
    state->list = state->ui->obj_create(state->root);
    if (!state->list) return false;
    state->ui->obj_set_size(state->list, width, height - 29);
    state->ui->obj_set_pos(state->list, 0, 0);
    state->ui->obj_clear_flag(state->list, GM_PLUGIN_LVGL_FLAG_SCROLLABLE);
    style(state, state->list, GM_PLUGIN_LVGL_STYLE_BORDER_WIDTH, number(0));
    style(state, state->list, GM_PLUGIN_LVGL_STYLE_PAD_TOP, number(0));
    style(state, state->list, GM_PLUGIN_LVGL_STYLE_PAD_LEFT, number(0));
    style(state, state->list, GM_PLUGIN_LVGL_STYLE_BG_OPA, number(255));
    style(state, state->list, GM_PLUGIN_LVGL_STYLE_BG_COLOR, color(0x00));
    state->list_title = line_label(state, state->list, "받은 메시지", split + 10, 8, row_width);
    if (!state->list_title || !line_label(state, state->list, "메신저", 12, 8, split - 20)) return false;
    for (uint32_t i = 0; i < 3; ++i) {
        state->categories[i] = line_label(state, state->list, category_names[i], 12, 43 + (int32_t)i * 42, split - 23);
        if (!state->categories[i]) return false;
        style(state, state->categories[i], GM_PLUGIN_LVGL_STYLE_PAD_LEFT, number(5));
    }
    for (uint32_t i = 0; i < LIST_ROWS; ++i) {
        gm_plugin_lvgl_obj_t *row = state->ui->obj_create(state->list);
        if (!row) return false;
        state->rows[i] = row;
        state->ui->obj_set_pos(row, split + 10, 34 + (int32_t)i * row_height);
        state->ui->obj_set_size(row, row_width, row_height - 3);
        state->ui->obj_clear_flag(row, GM_PLUGIN_LVGL_FLAG_SCROLLABLE);
        style(state, row, GM_PLUGIN_LVGL_STYLE_BORDER_WIDTH, number(0));
        style(state, row, GM_PLUGIN_LVGL_STYLE_PAD_LEFT, number(0));
        style(state, row, GM_PLUGIN_LVGL_STYLE_PAD_TOP, number(0));
        style(state, row, GM_PLUGIN_LVGL_STYLE_BG_OPA, number(255));
        if (state->ui->struct_size >= GM_PLUGIN_MEMBER_END(gm_plugin_lvgl_api_t, image_set_source) &&
            state->ui->image_create && state->ui->image_set_source) {
            state->row_icons[i] = state->ui->image_create(row, &kakao_icon);
            if (state->row_icons[i]) state->ui->obj_set_pos(state->row_icons[i], 6, (row_height - 39) / 2);
        }
        state->senders[i] = line_label(state, row, "", text_left, 5, row_width - time_width - text_left - 12);
        state->times[i] = line_label(state, row, "", row_width - time_width - 7, 5, time_width);
        state->previews[i] = line_label(state, row, "", text_left, 31, row_width - text_left - 7);
        if (!state->senders[i] || !state->times[i] || !state->previews[i]) return false;
        style(state, state->times[i], GM_PLUGIN_LVGL_STYLE_TEXT_ALIGN, number(GM_PLUGIN_LVGL_TEXT_ALIGN_RIGHT));
    }
    state->empty = line_label(state, state->list, "받은 메시지가 없습니다", split + 17, 49, row_width - 12);
    visible(state, state->list, false);
    return state->empty != 0;
}

static gm_plugin_result_t start(void *context) {
    messenger_reply_t *state = context;
    gm_plugin_display_info_t display;
    gm_plugin_lvgl_obj_t *host_root = state->ui->root_get();
    if (!host_root || state->host->display_get_info(&display) != GM_PLUGIN_OK) {
        return GM_PLUGIN_ESTATE;
    }

    state->ui->obj_clean(host_root);
    state->display_height = display.height;
    state->root = state->ui->obj_create(host_root);
    if (!state->root) return GM_PLUGIN_ENOMEM;
    state->ui->obj_set_size(state->root, display.width, display.height);
    state->ui->obj_align(state->root, GM_PLUGIN_LVGL_ALIGN_CENTER, 0, 0);
    style(state,state->root,GM_PLUGIN_LVGL_STYLE_BORDER_WIDTH,number(0));
    style(state,state->root,GM_PLUGIN_LVGL_STYLE_PAD_TOP,number(0));
    style(state,state->root,GM_PLUGIN_LVGL_STYLE_PAD_BOTTOM,number(0));
    style(state,state->root,GM_PLUGIN_LVGL_STYLE_PAD_LEFT,number(0));
    style(state,state->root,GM_PLUGIN_LVGL_STYLE_PAD_RIGHT,number(0));
    style(state, state->root, GM_PLUGIN_LVGL_STYLE_BG_COLOR, color(0x00));
    style(state, state->root, GM_PLUGIN_LVGL_STYLE_BG_OPA, number(255));

    state->icon = make_label(state, state->root, "M");
    for (uint32_t i=0U;i<3U;i++) state->actions[i]=make_label(state,state->root,"");
    state->title = make_label(state, state->root, "Memo 보조 앱 메신저");
    state->body = make_label(state, state->root, "휴대폰 보조 APK 연결 대기");
    state->hint = make_label(state, state->root,
                             "휴대폰에서 보조 앱을 실행하세요");
    if (!state->title || !state->body || !state->hint || !state->icon || !state->actions[0] || !state->actions[1] || !state->actions[2]
        || !create_list(state, display.width, display.height)) {
        state->ui->obj_clean(host_root);
        state->root = 0;
        state->title = 0;
        state->body = 0;
        state->hint = 0;
        return GM_PLUGIN_ENOMEM;
    }

    state->ui->obj_set_size(state->icon,36,36);
    state->ui->obj_set_pos(state->icon,14,12);
    style(state,state->icon,GM_PLUGIN_LVGL_STYLE_BG_COLOR,color(0xFF));
    style(state,state->icon,GM_PLUGIN_LVGL_STYLE_BG_OPA,number(255));
    style(state,state->icon,GM_PLUGIN_LVGL_STYLE_TEXT_COLOR,color(0x00));
    style(state,state->icon,GM_PLUGIN_LVGL_STYLE_RADIUS,number(8));
    state->icon_image = 0;
    if (state->ui->struct_size >= GM_PLUGIN_MEMBER_END(gm_plugin_lvgl_api_t, image_set_source) &&
        state->ui->image_create && state->ui->image_set_source) {
        state->icon_image = state->ui->image_create(state->root, &line_icon);
        if (state->icon_image) {
            state->ui->obj_set_pos(state->icon_image,14,12);
            state->ui->obj_add_flag(state->icon_image, GM_PLUGIN_LVGL_FLAG_HIDDEN);
        }
    }
    state->ui->obj_set_size(state->title, display.width - 76, 36);
    state->ui->obj_set_pos(state->title,62,12);
    style(state,state->title,GM_PLUGIN_LVGL_STYLE_TEXT_ALIGN,number(GM_PLUGIN_LVGL_TEXT_ALIGN_LEFT));
    for(uint32_t i=0U;i<3U;i++){
        state->ui->obj_set_size(state->actions[i],(display.width-44)/3,40);
        state->ui->obj_set_pos(state->actions[i],14+(int32_t)i*((display.width-44)/3+8),display.height-ACTIONS_BOTTOM_OFFSET);
        style(state,state->actions[i],GM_PLUGIN_LVGL_STYLE_BG_OPA,number(0));
        style(state,state->actions[i],GM_PLUGIN_LVGL_STYLE_PAD_TOP,number(5));
        style(state,state->actions[i],GM_PLUGIN_LVGL_STYLE_BG_COLOR,color(i==0U?0xFF:0x22));
        style(state,state->actions[i],GM_PLUGIN_LVGL_STYLE_TEXT_COLOR,color(i==0U?0x00:0xFF));
        style(state,state->actions[i],GM_PLUGIN_LVGL_STYLE_RADIUS,number(8));
    }
    state->ui->obj_set_size(state->body, display.width - 28,
                            display.height - READER_HINT_BOTTOM_OFFSET - HINT_GAP - READER_BODY_TOP);
    state->ui->obj_set_pos(state->body,14,READER_BODY_TOP);
    style(state,state->body,GM_PLUGIN_LVGL_STYLE_TEXT_ALIGN,number(GM_PLUGIN_LVGL_TEXT_ALIGN_LEFT));
    state->ui->obj_set_size(state->hint, display.width - 20, HINT_HEIGHT);
    state->ui->obj_set_pos(state->hint,10,display.height-READER_HINT_BOTTOM_OFFSET);
    style(state,state->hint,GM_PLUGIN_LVGL_STYLE_TRANSFORM_ZOOM,number(190));
    style(state,state->hint,GM_PLUGIN_LVGL_STYLE_TRANSFORM_PIVOT_X,number((display.width-20)/2));
    state->list_view = 0U;
    state->reply_selected = 0U;
    state->voice_active = 0U;
    state->reply_allowed = 0U;
    state->reading = 0U;
    state->sleeping = 0U;
    for (uint32_t i = 0U; i < NOTIFICATION_ID_BYTES; ++i) state->notification_id[i] = 0U;
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

static char *append_count(char *out, uint32_t value) {
    if (value >= 100U) *out++ = (char)('0' + value / 100U);
    if (value >= 10U) *out++ = (char)('0' + value / 10U % 10U);
    *out++ = (char)('0' + value % 10U);
    return out;
}

static bool receive_list(messenger_reply_t *state, const uint8_t *data, uint32_t length) {
    static char fields[LIST_ROWS][3][129];
    static const uint8_t limits[] = {64, 16, 128};
    uint32_t pos = data[0] == 8U ? 73U : 69U;
    if (length < pos || length > 1024U || data[65] > 2U || data[66] > 1U
        || data[68] > LIST_ROWS || (data[68] && data[67] >= data[68])) return true;
    char title[64];
    char *out = title;
    for (const char *p = category_names[data[65]]; *p; ++p) *out++ = *p;
    for (const char *p = " 메시지"; *p; ++p) *out++ = *p;
    if (data[0] == 8U) {
        uint32_t position = (uint32_t)data[69] * 256U + data[70];
        uint32_t total = (uint32_t)data[71] * 256U + data[72];
        if (total > 300U || position > total || (position == 0U) != (data[68] == 0U)) return true;
        *out++ = ' ';
        out = append_count(out, position);
        *out++ = '/';
        out = append_count(out, total);
    }
    *out = '\0';
    for (uint32_t i = 0; i < data[68]; ++i) {
        for (uint32_t field = 0; field < 3; ++field) {
            if (pos == length) return true;
            uint32_t count = data[pos++];
            if (count > limits[field] || count > length - pos || !valid_utf8(data + pos, count)) return true;
            state->libc->memcpy(fields[i][field], data + pos, count);
            fields[i][field][count] = '\0';
            pos += count;
        }
    }
    if (pos != length) return true;
    state->libc->memcpy(state->notification_id, data + 1U, NOTIFICATION_ID_BYTES);
    state->reading = 0U;
    state->reply_selected = 0U;
    state->voice_active = 0U;
    state->sleeping = 0U;
    set_list_view(state, true);
    state->ui->label_set_text(state->list_title, title);
    visible(state, state->empty, data[68] == 0U);
    for (uint32_t i = 0; i < 3; ++i) {
        bool category_selected = i == data[65];
        bool category_focused = category_selected && !data[66];
        style(state, state->categories[i], GM_PLUGIN_LVGL_STYLE_BG_COLOR, color(category_focused ? 0xFF : 0x33));
        style(state, state->categories[i], GM_PLUGIN_LVGL_STYLE_BG_OPA, number(category_selected ? 255 : 0));
        style(state, state->categories[i], GM_PLUGIN_LVGL_STYLE_TEXT_COLOR, color(category_focused ? 0 : 0xFF));
    }
    for (uint32_t i = 0; i < LIST_ROWS; ++i) {
        visible(state, state->rows[i], i < data[68]);
        if (i >= data[68]) continue;
        bool focused = data[66] && i == data[67];
        style(state, state->rows[i], GM_PLUGIN_LVGL_STYLE_BG_COLOR, color(focused ? 0x45 : 0x19));
        if (state->row_icons[i]) state->ui->image_set_source(state->row_icons[i], category_icons[data[65]]);
        gm_plugin_lvgl_obj_t *labels[] = {state->senders[i], state->times[i], state->previews[i]};
        for (uint32_t field = 0; field < 3; ++field) {
            state->ui->label_set_text(labels[field], fields[i][field]);
            style(state, labels[field], GM_PLUGIN_LVGL_STYLE_TEXT_COLOR, color(focused || !field ? 0xFF : 0xBE));
        }
    }
    set_hint(state, data[66] ? "한 번 다음  ·  두 번 이전  ·  길게 열기" : "한 번 다음  ·  두 번 이전  ·  길게 목록으로");
    (void)state->host->display_control.screen_turn_on(true);
    return true;
}

static bool receive_text(messenger_reply_t *state,
                         const gm_plugin_event_t *event) {
    static char text[MAX_TEXT + 1U];
    const uint8_t *data = event->data.bt.data;
    uint32_t length = event->data.bt.length;
    uint32_t text_length;
    uint32_t header_bytes;
    uint32_t id_offset;
    if (data && length && (data[0] == 7U || data[0] == 8U)) return receive_list(state, data, length);
    /* Version 3 sleep control is scoped to the currently displayed task. */
    if (data && length == 66U && data[0] == 3U && data[1] == 0U) {
        uint8_t reply[67U];
        gm_plugin_result_t result;
        if (!state->notification_id[0]) return true;
        for (uint32_t i = 0U; i < NOTIFICATION_ID_BYTES; ++i) {
            if (state->notification_id[i] != data[2U + i]) return true;
        }
        reply[0] = 3U;
        reply[1] = 0U;
        state->libc->memcpy(&reply[3], state->notification_id, NOTIFICATION_ID_BYTES);
        result = state->host->display_control.screen_turn_on(false);
        reply[2] = (uint8_t)(result < 0 ? -result : result);
        if (result == GM_PLUGIN_OK) {
            state->reply_selected = 0U;
            state->voice_active = 0U;
            state->sleeping = 1U;
            set_list_view(state, false);
            state->ui->label_set_text(state->body, "새 메시지 대기 중");
            set_hint(state, "");
        } else {
            set_hint(state, "답장 전달됨 / 화면 끄기 실패");
        }
        if (state->host->bt_send(REPLY_CHANNEL, reply, sizeof(reply)) != GM_PLUGIN_OK && state->host->log) {
            state->host->log("messenger screen-control reply failed");
        }
        return true;
    }
    if(data && length>70U && length<=1024U && data[0]==6U){
        static char card[955]; uint32_t first=0U,second=0U;
        uint32_t size=length-70U;
        if(!valid_utf8(data+70U,size))return true;
        state->libc->memcpy(card,data+70U,size);card[size]='\0';
        for(uint32_t i=0U;i<size;i++)if(card[i]==31){if(!first)first=i;else if(!second)second=i;else return true;}
        if(!first||!second)return true;
        card[first]='\0';card[second]='\0';
        char *labels=card+second+1U;char *parts[3]={labels,0,0};uint32_t count=1U;
        for(uint32_t i=0U;labels[i];i++)if(labels[i]=='|'&&count<3U){labels[i]='\0';parts[count++]=labels+i+1U;}
        if(count!=3U)return true;
        set_list_view(state, false);
        state->libc->memcpy(state->notification_id,data+2U,NOTIFICATION_ID_BYTES);
        state->reply_selected=(data[1]&1U)!=0U;state->voice_active=(data[1]&2U)!=0U;
        state->reply_allowed=(data[1]&4U)!=0U;state->reading=(data[1]&8U)!=0U;state->sleeping=0U;
        state->ui->label_set_text(state->title,card);
        state->ui->label_set_text(state->body,card+first+1U);
        set_app_icon(state, data[66]);
        if (data[67] == 0U) {
            parts[0] = "다음";
            parts[1] = "이전";
            parts[2] = "선택";
        }
        for(uint32_t i=0U;i<3U;i++){
            state->ui->label_set_text(state->actions[i],parts[i]);
            style(state,state->actions[i],GM_PLUGIN_LVGL_STYLE_BG_OPA,number(parts[i][0] ? 255 : 0));
            style(state,state->actions[i],GM_PLUGIN_LVGL_STYLE_BG_COLOR,color(i==data[68]?0xFF:0x22));
            style(state,state->actions[i],GM_PLUGIN_LVGL_STYLE_TEXT_COLOR,color(i==data[68]?0x00:0xFF));
        }
        set_button_hint(state);
        (void)state->host->display_control.screen_turn_on(true);return true;
    }
    if (!data || length < 1U || length > 1024U || (data[0] != PROTOCOL_VERSION && data[0] != 4U && data[0] != 5U)) {
        set_hint(state, "잘못된 메시지 무시됨");
        return true;
    }
    header_bytes = data[0] >= 4U ? 66U : HEADER_BYTES;
    id_offset = data[0] >= 4U ? 2U : 1U;
    if (length <= header_bytes) return true;
    text_length = length - header_bytes;
    if (!valid_utf8(&data[header_bytes], text_length)) {
        set_hint(state, "잘못된 UTF-8 메시지 무시됨");
        return true;
    }
    if (state->list_view) set_list_view(state, false);
    for (uint32_t i = 0U; i < NOTIFICATION_ID_BYTES; ++i) {
        if (state->notification_id[i] != data[id_offset + i]) {
            state->reply_selected = 0U;
            state->voice_active = 0U;
            break;
        }
    }
    state->libc->memcpy(state->notification_id, &data[id_offset],
                        NOTIFICATION_ID_BYTES);
    state->libc->memcpy(text, &data[header_bytes], text_length);
    text[text_length] = '\0';
    state->ui->label_set_text(state->body, text);
    state->sleeping = 0U;
    if (data[0] >= 4U) {
        state->reply_selected = (data[1] & 1U) != 0U;
        state->voice_active = (data[1] & 2U) != 0U;
        state->reply_allowed = (data[1] & 4U) != 0U;
        state->reading = data[0] == 5U ? (data[1] & 8U) != 0U : 1U;
    } else state->reply_allowed = 1U;
    if (data[0] == 2U) {
        state->reading = 0U;
        set_app_icon(state, 0);
        for (uint32_t i = 0U; i < 3U; i++) {
            state->ui->label_set_text(state->actions[i], "");
            style(state,state->actions[i],GM_PLUGIN_LVGL_STYLE_BG_OPA,number(0));
        }
    }
    if (data[0] == 2U) {
        set_hint(state, "길게 눌러 목록 불러오기");
        (void)send_command(state, 13U);
    }
    else set_button_hint(state);
    if (state->host->display_control.screen_turn_on(true) != GM_PLUGIN_OK) {
        set_hint(state, "화면 켜기 요청 실패");
        if (state->host->log) state->host->log("messenger screen wake failed");
    }
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
    if (state->sleeping) {
        (void)send_command(state, 7U);
        return true;
    }
    if (event->data.button.action == GM_PLUGIN_BUTTON_ACTION_TRIGGER && !state->voice_active) {
        uint8_t command = 0U;
        switch (event->data.button.button) {
        case GM_PLUGIN_BUTTON_LEFT: command = state->list_view ? 11U : 5U; break;
        case GM_PLUGIN_BUTTON_RIGHT: command = state->list_view ? 12U : 6U; break;
        case GM_PLUGIN_BUTTON_UP: case GM_PLUGIN_BUTTON_PAGE_UP: command = state->list_view ? 5U : 8U; break;
        case GM_PLUGIN_BUTTON_DOWN: case GM_PLUGIN_BUTTON_PAGE_DOWN: command = state->list_view ? 6U : 9U; break;
        default: break;
        }
        if (command) {

            if ((command == 8U || command == 9U) && !state->reading) return true;
            (void)send_command(state, command); return true;
        }
    }

    if (event->data.button.button == GM_PLUGIN_BUTTON_BACK &&
        event->data.button.action == GM_PLUGIN_BUTTON_ACTION_TRIGGER) {
        if (state->list_view) {
            (void)send_command(state, 11U);
            return true;
        }
        if (!send_command(state, 4U)) {
            set_hint(state, "취소 요청 전송 실패");
            return true;
        }
        state->reply_selected = 0U;
        state->voice_active = 0U;
        set_hint(state, "답장 취소");
        return true;
    }

    if(event->data.button.button != GM_PLUGIN_BUTTON_PRIMARY) return false;
    uint8_t command=0U;
    switch(event->data.button.action){
    case GM_PLUGIN_BUTTON_ACTION_SINGLE:command=6U;break;
    case GM_PLUGIN_BUTTON_ACTION_DOUBLE:command=state->reading?1U:5U;break;
    case GM_PLUGIN_BUTTON_ACTION_LONG:
        if (state->voice_active) return true;
        command=state->reading?9U:1U;
        break;
    default:return false;
    }
    if(!send_command(state,command))set_hint(state,"요청 전송 실패 · 휴대폰 연결 확인");
    return true;
}

static void suspend(void *context) {
    messenger_reply_t *state = context;
    state->reply_selected = 0U;
    state->voice_active = 0U;
    set_hint(state, "일시 중지됨");
}

static void resume(void *context) {
    messenger_reply_t *state = context;
    set_button_hint(state);
}

static void stop(void *context) {
    messenger_reply_t *state = context;
    gm_plugin_lvgl_obj_t *root = state->ui->root_get();
    if (root) state->ui->obj_clean(root);
    state->root = 0;
    state->title = 0;
    state->body = 0;
    state->hint = 0;
    state->icon = 0;
    state->icon_image = 0;
}

gm_plugin_result_t gm_plugin_entry(const gm_plugin_host_api_t *host,
                                   gm_plugin_descriptor_t *plugin) {
    uint32_t required = GM_PLUGIN_CAP_BUTTON | GM_PLUGIN_CAP_BLUETOOTH |
                        GM_PLUGIN_CAP_DISPLAY_CONTROL;
    if (!host || !plugin ||
        !GM_PLUGIN_VERSION_COMPATIBLE(host->abi_version,
                                      GM_PLUGIN_ABI_MIN_VERSION) ||
        host->struct_size < GM_PLUGIN_HOST_API_MIN_SIZE ||
        plugin->struct_size < GM_PLUGIN_DESCRIPTOR_MIN_SIZE ||
        !host->graphics.lvgl || !host->bt_send || !host->display_get_info ||
        !host->display_control.screen_turn_on ||
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
    plugin->on_resume = resume;
    plugin->on_event = on_event;
    plugin->on_suspend = suspend;
    plugin->on_stop = stop;
    return GM_PLUGIN_OK;
}

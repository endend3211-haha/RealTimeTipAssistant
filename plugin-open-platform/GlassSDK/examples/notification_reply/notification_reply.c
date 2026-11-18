#include "gm_plugin_lvgl_api.h"
#include "gm_plugin_libc.h"

#define REPLY_CHANNEL 20050U
#define MAX_TEXT 1024U

typedef struct {
    const gm_plugin_host_api_t *host;
    const gm_plugin_lvgl_api_t *ui;
    const gm_plugin_libc_extension_api_t *libc;
    gm_plugin_lvgl_obj_t *root;
    gm_plugin_lvgl_obj_t *title;
    gm_plugin_lvgl_obj_t *body;
    gm_plugin_lvgl_obj_t *hint;
    uint8_t mode;
} reply_t;
static reply_t app;

#define color gm_plugin_lvgl_style_color
#define number gm_plugin_lvgl_style_number
static void style(reply_t *s, gm_plugin_lvgl_obj_t *o, gm_plugin_lvgl_style_prop_t p, gm_plugin_lvgl_style_value_t v) { s->ui->style_set(o, p, v, GM_PLUGIN_LVGL_SELECTOR_MAIN); }
static gm_plugin_lvgl_obj_t *label(reply_t *s, gm_plugin_lvgl_obj_t *parent, const char *text) {
    gm_plugin_lvgl_obj_t *o = s->ui->label_create(parent); if (!o) return 0;
    s->ui->label_set_text(o, text); style(s, o, GM_PLUGIN_LVGL_STYLE_TEXT_COLOR, color(0xFF));
    style(s, o, GM_PLUGIN_LVGL_STYLE_TEXT_ALIGN, number(GM_PLUGIN_LVGL_TEXT_ALIGN_CENTER)); return o;
}
static void send_command(reply_t *s, uint8_t command) {
    uint8_t packet[2] = { 1, command };
    if (s->host->bt_send) (void)s->host->bt_send(REPLY_CHANNEL, packet, sizeof(packet));
}
static void set_hint(reply_t *s, const char *text) { if (s->hint) s->ui->label_set_text(s->hint, text); }
static gm_plugin_result_t start(void *context) {
    reply_t *s = context; gm_plugin_display_info_t d;
    gm_plugin_lvgl_obj_t *root = s->ui->root_get(); if (!root || s->host->display_get_info(&d) != GM_PLUGIN_OK) return GM_PLUGIN_ESTATE;
    s->ui->obj_clean(root); s->root = s->ui->obj_create(root); if (!s->root) return GM_PLUGIN_ENOMEM;
    s->ui->obj_set_size(s->root, d.width, d.height); s->ui->obj_align(s->root, GM_PLUGIN_LVGL_ALIGN_CENTER, 0, 0);
    style(s, s->root, GM_PLUGIN_LVGL_STYLE_BG_COLOR, color(0x00)); style(s, s->root, GM_PLUGIN_LVGL_STYLE_BG_OPA, number(255));
    s->title = label(s, s->root, "알림"); s->body = label(s, s->root, "알림 대기 중"); s->hint = label(s, s->root, "한번: 답장  두번: 음성  길게: 보내기");
    if (!s->title || !s->body || !s->hint) return GM_PLUGIN_ENOMEM;
    s->ui->obj_set_size(s->title, d.width - 20, 36); s->ui->obj_align(s->title, GM_PLUGIN_LVGL_ALIGN_TOP_MID, 0, 14);
    s->ui->obj_set_size(s->body, d.width - 30, 190); s->ui->obj_align(s->body, GM_PLUGIN_LVGL_ALIGN_CENTER, 0, 0);
    s->ui->obj_set_size(s->hint, d.width - 20, 42); s->ui->obj_align(s->hint, GM_PLUGIN_LVGL_ALIGN_BOTTOM_MID, 0, -12);
    s->mode = 0; return GM_PLUGIN_OK;
}
static bool on_event(void *context, const gm_plugin_event_t *event) {
    reply_t *s = context; if (!event) return false;
    if (event->type == GM_PLUGIN_EVENT_BT_MESSAGE &&
        event->data.bt.channel == REPLY_CHANNEL) {
        static char text[MAX_TEXT + 1]; uint32_t n = event->data.bt.length < MAX_TEXT ? event->data.bt.length : MAX_TEXT;
        /* Keep a truncated UTF-8 payload on a character boundary. */
        if (event->data.bt.data && n < event->data.bt.length) {
            while (n && (event->data.bt.data[n] & 0xC0U) == 0x80U) --n;
        }
        if (n && event->data.bt.data) { s->libc->memcpy(text, event->data.bt.data, n); text[n] = 0; s->ui->label_set_text(s->body, text); set_hint(s, "알림 수신. 한번 눌러 답장"); }
        if (s->host->log) s->host->log("notification text received: channel=%u bytes=%u", REPLY_CHANNEL, (unsigned int)n);
        return true;
    }
    if (event->type != GM_PLUGIN_EVENT_BUTTON) return false;
    switch (event->data.button.action) {
    case GM_PLUGIN_BUTTON_ACTION_SINGLE: s->mode = 1; send_command(s, 1); set_hint(s, "답장 모드. 두번 눌러 음성 입력"); return true;
    case GM_PLUGIN_BUTTON_ACTION_DOUBLE: s->mode = 2; send_command(s, 2); set_hint(s, "음성 입력 중… 다시 두번 눌러 완료"); return true;
    case GM_PLUGIN_BUTTON_ACTION_LONG: s->mode = 3; send_command(s, 3); set_hint(s, "최종 보내기 요청"); return true;
    default: break;
    }
    if (event->data.button.button == GM_PLUGIN_BUTTON_BACK && event->data.button.action == GM_PLUGIN_BUTTON_ACTION_TRIGGER) { send_command(s, 4); set_hint(s, "취소"); return true; }
    return false;
}
static void stop(void *context) { reply_t *s = context; gm_plugin_lvgl_obj_t *root = s->ui->root_get(); if (root) s->ui->obj_clean(root); s->root = 0; }
gm_plugin_result_t gm_plugin_entry(const gm_plugin_host_api_t *host, gm_plugin_descriptor_t *plugin) {
    if (!host || !plugin || !host->graphics.lvgl || !host->bt_send || !host->display_get_info || (host->capabilities & (GM_PLUGIN_CAP_BUTTON | GM_PLUGIN_CAP_BLUETOOTH)) != (GM_PLUGIN_CAP_BUTTON | GM_PLUGIN_CAP_BLUETOOTH)) return GM_PLUGIN_ENOTSUP;
    app.host = host; app.ui = host->graphics.lvgl; if (gm_plugin_libc_get(host, &app.libc) != GM_PLUGIN_OK) return GM_PLUGIN_ENOTSUP; plugin->abi_version = GM_PLUGIN_ABI_MIN_VERSION; plugin->context = &app; plugin->on_start = start; plugin->on_event = on_event; plugin->on_stop = stop; return GM_PLUGIN_OK;
}

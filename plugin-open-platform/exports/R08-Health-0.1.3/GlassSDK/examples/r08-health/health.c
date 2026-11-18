#include "gm_plugin_lvgl_api.h"
#include "gm_plugin_libc.h"

#define REQUEST_CHANNEL 0x5248U
#define REPLY_CHANNEL 0x5249U
#define MAX_TEXT 800U
#define PAGE_LINES 5U

static const gm_plugin_host_api_t *host;
static const gm_plugin_lvgl_api_t *ui;
static const gm_plugin_libc_extension_api_t *libc;
static gm_plugin_lvgl_obj_t *label;
static char content[MAX_TEXT + 1U];
static uint32_t page;
static char page_text[MAX_TEXT + 96U];

static void draw_page(void)
{
    uint32_t start = 0, end, line = 0, offset = 0;
    char *text = page_text;
    for (end = 0; content[end] != 0 && line < page * PAGE_LINES; ++end) {
        if (content[end] == '\n') ++line;
    }
    start = end;
    if (content[start] == 0 && page != 0U) { page = 0U; start = 0U; end = 0U; }
    offset = (uint32_t)libc->snprintf(text, sizeof(page_text), "R08 Health\n");
    line = 0U;
    while (content[end] != 0 && line < PAGE_LINES) {
        if (content[end] == '\n') ++line;
        ++end;
    }
    if (end - start + offset + 64U < sizeof(page_text)) {
        libc->memcpy(text + offset, content + start, end - start);
        offset += end - start;
    }
    libc->snprintf(text + offset, sizeof(page_text) - offset, "\n%u · 클릭하면 다음", (unsigned)(page + 1U));
    ui->label_set_text(label, text);
}

static gm_plugin_result_t start(void *context)
{
    gm_plugin_display_info_t display;
    (void)context;
    if (host->display_get_info(&display) != GM_PLUGIN_OK || display.width <= 24U || display.height <= 24U)
        return GM_PLUGIN_ENOTSUP;
    gm_plugin_lvgl_obj_t *root = ui->root_get();
    if (root == 0) return GM_PLUGIN_ESTATE;
    ui->obj_clean(root);
    label = ui->label_create(root);
    if (label == 0) return GM_PLUGIN_ENOMEM;
    ui->obj_set_size(label, (int16_t)(display.width - 24U), (int16_t)(display.height - 24U));
    ui->obj_align(label, GM_PLUGIN_LVGL_ALIGN_CENTER, 0, 0);
    ui->label_set_long_mode(label, GM_PLUGIN_LVGL_LABEL_WRAP);
    libc->snprintf(content, sizeof(content), "폰 플러그인에서 건강 조회를 눌러주세요.\nGATT 연결 기능 준비 중");
    page = 0U;
    draw_page();
    return GM_PLUGIN_OK;
}

static bool event(void *context, const gm_plugin_event_t *event)
{
    (void)context;
    if (event == 0) return false;
    if (event->type == GM_PLUGIN_EVENT_BUTTON) {
        if (event->data.button.action == GM_PLUGIN_BUTTON_ACTION_SINGLE
                || event->data.button.action == GM_PLUGIN_BUTTON_ACTION_TRIGGER) {
            ++page; draw_page(); return true;
        }
        return false;
    }
    if (event->type != GM_PLUGIN_EVENT_BT_MESSAGE || event->data.bt.channel != REQUEST_CHANNEL)
        return false;
    const uint8_t *data = event->data.bt.data;
    uint32_t length = event->data.bt.length;
    if (data == 0 || length < 5U || length > MAX_TEXT + 4U || data[0] != 1U || data[1] != 1U)
        return false;
    libc->memcpy(content, data + 4U, length - 4U);
    content[length - 4U] = 0;
    page = 0U;
    draw_page();
    uint8_t ack[4] = {1U, 2U, data[2], data[3]};
    host->bt_send(REPLY_CHANNEL, ack, sizeof(ack));
    return true;
}

static void stop(void *context)
{
    (void)context;
    label = 0;
    gm_plugin_lvgl_obj_t *root = ui->root_get();
    if (root != 0) ui->obj_clean(root);
}

gm_plugin_result_t gm_plugin_entry(const gm_plugin_host_api_t *api, gm_plugin_descriptor_t *plugin)
{
    if (api == 0 || plugin == 0 || api->struct_size < GM_PLUGIN_HOST_API_MIN_SIZE
            || plugin->struct_size < GM_PLUGIN_DESCRIPTOR_MIN_SIZE
            || !GM_PLUGIN_VERSION_COMPATIBLE(api->abi_version, GM_PLUGIN_ABI_MIN_VERSION)
            || (api->capabilities & GM_PLUGIN_CAP_BLUETOOTH) == 0
            || api->bt_send == 0 || api->display_get_info == 0 || api->graphics.lvgl == 0)
        return GM_PLUGIN_ENOTSUP;
    host = api; ui = api->graphics.lvgl;
    if (ui->struct_size < GM_PLUGIN_LVGL_API_MIN_SIZE
            || !GM_PLUGIN_VERSION_COMPATIBLE(ui->api_version, GM_PLUGIN_LVGL_API_MIN_VERSION)
            || gm_plugin_libc_get(host, &libc) != GM_PLUGIN_OK) return GM_PLUGIN_ENOTSUP;
    plugin->abi_version = GM_PLUGIN_ABI_MIN_VERSION;
    plugin->on_start = start; plugin->on_event = event; plugin->on_stop = stop;
    return GM_PLUGIN_OK;
}



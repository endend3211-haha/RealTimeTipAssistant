#include "gm_plugin_lvgl_api.h"
#include "gm_plugin_libc.h"

#define REQUEST_CHANNEL 0x4647U
#define REPLY_CHANNEL 0x4648U
#define MAX_HEALTH_TEXT 900U

static const gm_plugin_host_api_t *s_host;
static const gm_plugin_lvgl_api_t *s_lvgl;
static const gm_plugin_libc_extension_api_t *s_libc;
static gm_plugin_lvgl_obj_t *s_label;

static gm_plugin_result_t health_start(void *context)
{
    gm_plugin_display_info_t display;
    gm_plugin_lvgl_obj_t *root;
    (void)context;
    if (s_host->display_get_info(&display) != GM_PLUGIN_OK)
        return GM_PLUGIN_ENOTSUP;
    root = s_lvgl->root_get();
    if (root == 0) return GM_PLUGIN_ESTATE;
    s_lvgl->obj_clean(root);
    s_label = s_lvgl->label_create(root);
    if (s_label == 0) return GM_PLUGIN_ENOMEM;
    if (display.width <= 24U || display.height <= 24U) return GM_PLUGIN_ENOTSUP;
    s_lvgl->obj_set_size(s_label, (int16_t)(display.width - 24U),
                         (int16_t)(display.height - 24U));
    s_lvgl->obj_align(s_label, GM_PLUGIN_LVGL_ALIGN_CENTER, 0, 0);
    s_lvgl->label_set_long_mode(s_label, GM_PLUGIN_LVGL_LABEL_WRAP);
    s_lvgl->label_set_text(s_label, "MemoMind Health\n건강 정보 수신 대기 중");
    return GM_PLUGIN_OK;
}

static bool health_message(void *context, const gm_plugin_event_t *event)
{
    char *text;
    uint32_t length;
    static const char acknowledged[] = "HEALTH_OK";
    (void)context;
    if (event == 0 || event->type != GM_PLUGIN_EVENT_BT_MESSAGE ||
        event->data.bt.channel != REQUEST_CHANNEL ||
        event->data.bt.data == 0 || event->data.bt.length == 0U ||
        event->data.bt.length > MAX_HEALTH_TEXT)
        return false;

    length = event->data.bt.length;
    text = s_host->alloc(length + 1U);
    if (text == 0) return false;
    s_libc->memcpy(text, event->data.bt.data, length);
    text[length] = '\0';
    if (s_label != 0) s_lvgl->label_set_text(s_label, text);
    s_host->free(text);
    return s_host->bt_send(REPLY_CHANNEL, acknowledged,
                           (uint32_t)(sizeof(acknowledged) - 1U)) == GM_PLUGIN_OK;
}

static bool health_event(void *context, const gm_plugin_event_t *event)
{
    (void)context;
    if (event == 0) return false;
    if (event->type == GM_PLUGIN_EVENT_CONNECTION) {
        if (!event->data.connection.connected && s_label != 0)
            s_lvgl->label_set_text(s_label, "MemoMind Health\n안경 연결이 끊겼습니다");
        return true;
    }
    if (event->type == GM_PLUGIN_EVENT_BT_MESSAGE)
        return health_message(context, event);
    return false;
}

static void health_stop(void *context)
{
    gm_plugin_lvgl_obj_t *root;
    (void)context;
    s_label = 0;
    root = s_lvgl->root_get();
    if (root != 0) s_lvgl->obj_clean(root);
}

gm_plugin_result_t gm_plugin_entry(const gm_plugin_host_api_t *host,
                                   gm_plugin_descriptor_t *plugin)
{
    if (host == 0 || plugin == 0 || host->bt_send == 0 ||
        host->display_get_info == 0 || host->graphics.lvgl == 0 ||
        !GM_PLUGIN_VERSION_COMPATIBLE(host->abi_version,
                                      GM_PLUGIN_ABI_MIN_VERSION) ||
        host->struct_size < GM_PLUGIN_HOST_API_MIN_SIZE ||
        plugin->struct_size < GM_PLUGIN_DESCRIPTOR_MIN_SIZE ||
        (host->capabilities & GM_PLUGIN_CAP_BLUETOOTH) == 0U)
        return GM_PLUGIN_ENOTSUP;
    s_host = host;
    s_lvgl = host->graphics.lvgl;
    if (gm_plugin_libc_get(host, &s_libc) != GM_PLUGIN_OK)
        return GM_PLUGIN_ENOTSUP;
    if (s_lvgl->struct_size < GM_PLUGIN_LVGL_API_MIN_SIZE ||
        !GM_PLUGIN_VERSION_COMPATIBLE(s_lvgl->api_version,
                                      GM_PLUGIN_LVGL_API_MIN_VERSION))
        return GM_PLUGIN_EVERSION;
    plugin->abi_version = GM_PLUGIN_ABI_MIN_VERSION;
    plugin->on_start = health_start;
    plugin->on_event = health_event;
    plugin->on_stop = health_stop;
    return GM_PLUGIN_OK;
}

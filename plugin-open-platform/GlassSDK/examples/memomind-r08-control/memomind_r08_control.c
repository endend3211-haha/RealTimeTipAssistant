#include "gm_plugin_lvgl_api.h"
#include "gm_plugin_libc.h"

#define REQUEST_CHANNEL 0x4D52U
#define REPLY_CHANNEL 0x4D53U

static const gm_plugin_host_api_t *s_host;
static const gm_plugin_lvgl_api_t *s_lvgl;
static const gm_plugin_libc_extension_api_t *s_libc;
static gm_plugin_lvgl_obj_t *s_label;

static gm_plugin_result_t r08_start(void *context)
{
    gm_plugin_display_info_t display;
    gm_plugin_lvgl_obj_t *root;
    (void)context;
    if (s_host->display_get_info(&display) != GM_PLUGIN_OK) return GM_PLUGIN_ENOTSUP;
    root = s_lvgl->root_get();
    if (root == 0) return GM_PLUGIN_ESTATE;
    s_lvgl->obj_clean(root);
    s_label = s_lvgl->label_create(root);
    if (s_label == 0) return GM_PLUGIN_ENOMEM;
    s_lvgl->obj_set_size(s_label, (int16_t)(display.width - 32),
                         (int16_t)(display.height - 32));
    s_lvgl->obj_align(s_label, GM_PLUGIN_LVGL_ALIGN_CENTER, 0, 0);
    s_lvgl->label_set_long_mode(s_label, GM_PLUGIN_LVGL_LABEL_WRAP);
    s_lvgl->label_set_text(s_label, "MemoMind R08\nWaiting for command");
    return GM_PLUGIN_OK;
}

static const char *command_name(const uint8_t *data, uint32_t length)
{
    /* The PhoneSDK payload is JSON. Matching the command token is sufficient
       for the demo and avoids pulling a JSON parser into the small plugin. */
    char buffer[257];
    if (data == 0 || length == 0 || length > 256) return 0;
    s_libc->memcpy(buffer, data, length);
    buffer[length] = 0;
    if (s_libc->strstr(buffer, "next") != 0) return "NEXT";
    if (s_libc->strstr(buffer, "previous") != 0) return "PREVIOUS";
    if (s_libc->strstr(buffer, "select") != 0) return "SELECT";
    if (s_libc->strstr(buffer, "back") != 0) return "BACK";
    return 0;
}

static bool r08_event(void *context, const gm_plugin_event_t *event)
{
    const char *name;
    char reply[64];
    int written;
    (void)context;
    if (event == 0 || event->type != GM_PLUGIN_EVENT_BT_MESSAGE ||
        event->data.bt.channel != REQUEST_CHANNEL) return false;
    name = command_name(event->data.bt.data, event->data.bt.length);
    if (name == 0) return false;
    if (s_label != 0) {
        char text[96];
        written = s_libc->snprintf(text, sizeof(text), "MemoMind R08\n%s", name);
        if (written > 0) s_lvgl->label_set_text(s_label, text);
    }
    written = s_libc->snprintf(reply, sizeof(reply), "{\"ok\":true,\"command\":\"%s\"}", name);
    if (written <= 0) return false;
    return s_host->bt_send(REPLY_CHANNEL, reply, (uint32_t)written) == GM_PLUGIN_OK;
}

static void r08_stop(void *context)
{
    (void)context;
    s_label = 0;
}

gm_plugin_result_t gm_plugin_entry(const gm_plugin_host_api_t *host,
                                   gm_plugin_descriptor_t *plugin)
{
    if (host == 0 || plugin == 0 || host->bt_send == 0 ||
        host->display_get_info == 0 || host->graphics.lvgl == 0 ||
        !GM_PLUGIN_VERSION_COMPATIBLE(host->abi_version, GM_PLUGIN_ABI_MIN_VERSION) ||
        host->struct_size < GM_PLUGIN_HOST_API_MIN_SIZE ||
        plugin->struct_size < GM_PLUGIN_DESCRIPTOR_MIN_SIZE)
        return GM_PLUGIN_ENOTSUP;
    s_host = host;
    s_lvgl = host->graphics.lvgl;
    if (gm_plugin_libc_get(host, &s_libc) != GM_PLUGIN_OK) return GM_PLUGIN_ENOTSUP;
    plugin->abi_version = GM_PLUGIN_ABI_MIN_VERSION;
    plugin->on_start = r08_start;
    plugin->on_event = r08_event;
    plugin->on_stop = r08_stop;
    return GM_PLUGIN_OK;
}



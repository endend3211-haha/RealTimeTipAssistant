#define gm_plugin_entry megadrive_bridge_entry
#include "../web_bridge/plugin.c"
#undef gm_plugin_entry

#define WAKE_CHANNEL 0x4D44U
#define VIDEO_CHANNEL 0x4D46U
#define VIDEO_ACK_CHANNEL 0x4D47U

static bool waiting_for_video;

static gm_plugin_result_t wake_display(web_bridge_context_t *self)
{
    return self->host->display_control.screen_turn_on(true);
}

static gm_plugin_result_t megadrive_start(void *opaque)
{
    web_bridge_context_t *self = opaque;
    gm_plugin_result_t result = web_bridge_start(opaque);
    if (result != GM_PLUGIN_OK) return result;
    (void)wake_display(self);
    waiting_for_video = true;
    gm_plugin_lvgl_obj_t *label = self->lvgl->label_create(self->root);
    if (label != 0) {
        self->lvgl->label_set_text(label, "MEGA DRIVE / Waiting for video");
        self->lvgl->style_set(label, GM_PLUGIN_LVGL_STYLE_TEXT_COLOR,
                              style_color(0xffU), 0);
        self->lvgl->obj_align(label, GM_PLUGIN_LVGL_ALIGN_CENTER, 0, 0);
    }
    return GM_PLUGIN_OK;
}

static void megadrive_resume(void *opaque)
{
    (void)wake_display(opaque);
}

static bool megadrive_event(void *opaque, const gm_plugin_event_t *event)
{
    web_bridge_context_t *self = opaque;
    if (event != 0 && event->type == GM_PLUGIN_EVENT_BT_MESSAGE &&
        event->data.bt.channel == VIDEO_CHANNEL) {
        const uint8_t *data = event->data.bt.data;
        const uint32_t length = event->data.bt.length;
        if (data == 0 || length < 19U || data[0] != 1U || read_u32(data + 15) > 35840U)
            return false;
        if (waiting_for_video) {
            clear_scene(self);
            waiting_for_video = false;
        }
        uint8_t response[6] = {1U};
        write_u32(response + 1, read_u32(data + 1));
        response[5] = draw_bitmap_lz4(self, data + 5, length - 5, true);
        return send_event(self, VIDEO_ACK_CHANNEL, response, sizeof(response));
    }
    if (event != 0 && event->type == GM_PLUGIN_EVENT_BT_MESSAGE &&
        event->data.bt.channel == WAKE_CHANNEL) {
        if (event->data.bt.length != 1U || event->data.bt.data == 0) return false;
        const uint8_t response[2] = {event->data.bt.data[0], wake_display(self) == GM_PLUGIN_OK ? 0U : 1U};
        return send_event(self, WAKE_CHANNEL, response, sizeof(response));
    }
    return web_bridge_event(opaque, event);
}

gm_plugin_result_t gm_plugin_entry(const gm_plugin_host_api_t *host,
                                   gm_plugin_descriptor_t *plugin)
{
    gm_plugin_result_t result = megadrive_bridge_entry(host, plugin);
    if (result != GM_PLUGIN_OK) return result;
    if (!host->display_control.screen_turn_on) return GM_PLUGIN_ENOTSUP;
    plugin->on_start = megadrive_start;
    plugin->on_resume = megadrive_resume;
    plugin->on_event = megadrive_event;
    return GM_PLUGIN_OK;
}

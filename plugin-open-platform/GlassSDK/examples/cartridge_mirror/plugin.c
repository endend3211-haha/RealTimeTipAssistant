/* Reuse the SDK's validated framebuffer decoder and input packet protocol.
 * No decks, textures, projection math, fonts, animation, or app state live here.
 * Raw sensor samples stay local to the bridge's gesture classifier; only the
 * small classified gesture/button packets are sent to the phone. */
#define WEB_BRIDGE_RAW_IMU_INTERVAL_MS 0U
#define gm_plugin_entry pocket_bridge_entry
#include "../web_bridge/plugin.c"
#undef gm_plugin_entry

static bool mirror_event(void *opaque, const gm_plugin_event_t *event)
{
    web_bridge_context_t *self = opaque;
    if (event == 0) return false;
    if (event->type != GM_PLUGIN_EVENT_BT_MESSAGE)
        return web_bridge_event(opaque, event);
    if (event->data.bt.length != 0U && event->data.bt.data == 0)
        return false;
    /* Bitmap-only receiver. Layout/text/line commands are deliberately ignored.
     * Atomic frame tiles are decoded into the host back buffer and presented
     * only on the final tile. The inherited loop only classifies input and
     * expires incomplete frame transfers; it performs no UI animation. */
    switch (event->data.bt.channel) {
    case 0x4D46U: {
        const uint8_t *data = event->data.bt.data;
        uint32_t length = event->data.bt.length;
        uint8_t ack[6];
        uint8_t result;
        if (length < 19U || data[0] != 1U || read_u32(data + 15) > 79800U) return false;
        /* One complete changed rectangle is one presentation. No begin/tile
         * handshake, no font/layout work, and exactly one application ACK. */
        ack[0] = 1U;
        write_u32(ack + 1, read_u32(data + 1));
        result = self->frame_active ? FRAME_STATUS_WRONG_FRAME :
            draw_bitmap_lz4(self, data + 5, length - 5, true);
        ack[5] = result;
        return send_event(self, 0x4D47U, ack, sizeof(ack));
    }
    case WEB_BRIDGE_CHANNEL_CLEAR:
        if (!self->frame_active) clear_scene(self);
        return true;
    case WEB_BRIDGE_CHANNEL_BITMAP:
        if (!self->frame_active)
            (void)draw_bitmap(self, event->data.bt.data, event->data.bt.length, true);
        return true;
    case WEB_BRIDGE_CHANNEL_BITMAP_LZ4:
        if (!self->frame_active)
            (void)draw_bitmap_lz4(self, event->data.bt.data, event->data.bt.length, true);
        return true;
    case WEB_BRIDGE_CHANNEL_FRAME_BEGIN:
        handle_frame_begin(self, event->data.bt.data, event->data.bt.length);
        return true;
    case WEB_BRIDGE_CHANNEL_FRAME_TILE_LZ4:
        handle_frame_tile_lz4(self, event->data.bt.data, event->data.bt.length);
        return true;
    case WEB_BRIDGE_CHANNEL_PING:
        return send_event(self, WEB_BRIDGE_CHANNEL_PING, event->data.bt.data, event->data.bt.length);
    default:
        return false;
    }
}

gm_plugin_result_t gm_plugin_entry(const gm_plugin_host_api_t *host,
                                 gm_plugin_descriptor_t *plugin)
{
    gm_plugin_result_t result = pocket_bridge_entry(host, plugin);
    if (result == GM_PLUGIN_OK) plugin->on_event = mirror_event;
    return result;
}


#include "gm_plugin_lvgl_api.h"
#include "gm_plugin_extensions.h"
#include "gm_plugin_libc.h"
#include "navigation_parser.h"
#include "hud_direction.h"


typedef struct
{
    const gm_plugin_host_api_t *host;
    const gm_plugin_lvgl_api_t *lvgl;

    gm_plugin_lvgl_obj_t *hud;

} navigation_context_t;


static navigation_context_t context;


static gm_plugin_result_t navigation_start(void *opaque)
{
    navigation_context_t *self =
        (navigation_context_t*)opaque;

    gm_plugin_lvgl_obj_t *root =
        self->lvgl->root_get();

    if(!root)
        return GM_PLUGIN_ESTATE;


    self->hud =
        self->lvgl->label_create(root);

    if(!self->hud)
        return GM_PLUGIN_ENOMEM;


    self->lvgl->label_set_text(
        self->hud,
        "↑\nIn 50m\nStraight\n15 km/h"
    );


    return GM_PLUGIN_OK;
}


static bool navigation_event(
    void *opaque,
    const gm_plugin_event_t *event
)
{
    navigation_context_t *self =
        (navigation_context_t*)opaque;


    if(!event)
        return false;


    if(event->type == GM_PLUGIN_EVENT_BT_MESSAGE)
    {
        if(event->data.bt.data)
        {
            navigation_data_t data;

            navigation_parse(
                (char*)event->data.bt.data,
                &data
            );


            char buffer[160];

            snprintf(
                buffer,
                sizeof(buffer),
                "%s\n%d m\n%s\n%d km/h",
                hud_direction_icon(data.direction),
                data.distance,
                data.instruction,
                data.speed
            );


            self->lvgl->label_set_text(
                self->hud,
                buffer
            );

            return true;
        }
    }

    return false;
}


static void navigation_stop(void *opaque)
{
}


gm_plugin_result_t gm_plugin_entry(
    const gm_plugin_host_api_t *host,
    gm_plugin_descriptor_t *plugin
)
{
    context.host = host;
    context.lvgl = host->graphics.lvgl;

    plugin->context = &context;
    plugin->on_start = navigation_start;
    plugin->on_event = navigation_event;
    plugin->on_stop = navigation_stop;

    return GM_PLUGIN_OK;
}

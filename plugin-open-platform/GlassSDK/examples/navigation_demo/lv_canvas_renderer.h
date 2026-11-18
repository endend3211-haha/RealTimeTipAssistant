
#ifndef LV_CANVAS_RENDERER_H
#define LV_CANVAS_RENDERER_H

#include "gm_plugin_lvgl_api.h"

typedef struct
{
    gm_plugin_lvgl_obj_t *canvas_root;
    gm_plugin_lvgl_obj_t *arrow_line;

} hud_canvas_context_t;


void hud_canvas_create(hud_canvas_context_t *ctx,
                       gm_plugin_lvgl_obj_t *parent);

void hud_canvas_draw_arrow(hud_canvas_context_t *ctx,
                           int direction);

#endif

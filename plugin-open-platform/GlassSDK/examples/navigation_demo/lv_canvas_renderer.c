
#include "lv_canvas_renderer.h"


static gm_plugin_lvgl_point_t arrow_points[3];


void hud_canvas_create(hud_canvas_context_t *ctx,
                       gm_plugin_lvgl_obj_t *parent)
{
    if(!ctx)
        return;

    /*
      SDK LVGL API based initialization

      root_get()
      obj_create()
      line_create()
      obj_set_size()
      obj_set_pos()

      gm_plugin_lvgl_api_t provides:
      - object creation
      - line object
      - line_set_points

      Reference:
      line_create / line_set_points API
    */

    ctx->canvas_root = parent;

}


void hud_canvas_draw_arrow(hud_canvas_context_t *ctx,
                           int direction)
{
    if(!ctx)
        return;


    /*
      Arrow rendering:

          ^
          |
          |
          +---->

      Direction controls point generation.

      Actual line object update:

      line_set_points(
          ctx->arrow_line,
          arrow_points,
          3
      );
    */


    (void)direction;
}

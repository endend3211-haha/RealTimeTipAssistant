#include "lvgl_hud_view.h"
#include "lvgl_arrow_widget.h"
#include "lvgl_distance_widget.h"
#include "lvgl_text_widget.h"


void lvgl_hud_view_init(void)
{
    /*
      V27 LVGL HUD View

      Create HUD Container

          |
          +-- Arrow Widget
          |
          +-- Distance Widget
          |
          +-- Text Widget
    */

    lvgl_arrow_widget_init();
    lvgl_distance_widget_init();
    lvgl_text_widget_init();
}


void lvgl_hud_view_refresh(void)
{
    /*
      Refresh LVGL widgets
    */
}
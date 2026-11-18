#include "lvgl_update_bridge.h"
#include "hud_binding.h"


void lvgl_update_bridge_tick(void)
{
    /*
      Runtime Tick

      Navigation Data
          |
          v
      View Model
          |
          v
      HUD Binding
          |
          v
      LVGL Widgets
    */

    hud_binding_update();
}
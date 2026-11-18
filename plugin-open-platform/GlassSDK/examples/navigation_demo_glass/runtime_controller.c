#include "runtime_controller.h"
#include "hud_binding.h"


void runtime_controller_tick(void)
{
    /*
      Runtime Update Loop

      SDK Event
          |
          v
      View Model
          |
          v
      HUD Binding
          |
          v
      LVGL Widget
    */

    hud_binding_update();
}
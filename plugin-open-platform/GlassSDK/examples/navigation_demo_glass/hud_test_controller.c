#include "hud_test_controller.h"
#include "navigation_test_event.h"
#include "hud_binding.h"


void hud_test_controller_run(void)
{
    /*
      Test Flow

      Test Event
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

    navigation_test_event_send();

    hud_binding_update();
}
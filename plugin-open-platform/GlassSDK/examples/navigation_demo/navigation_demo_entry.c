#include "navigation_demo_entry.h"
#include "sdk_navigation_adapter.h"
#include "lvgl_hud_view.h"
#include "runtime_controller.h"


void navigation_demo_init(void)
{
    /*
      Final Demo Initialization

      SDK
       |
       v
      HUD Runtime
       |
       v
      LVGL View
    */

    sdk_navigation_adapter_init();

    lvgl_hud_view_init();
}


void navigation_demo_tick(void)
{
    runtime_controller_tick();

    lvgl_hud_view_refresh();
}
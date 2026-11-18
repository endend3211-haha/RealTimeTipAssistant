
#include "app_init.h"
#include "hud_manager.h"
#include "navigation_callback.h"


void app_init(void)
{
    /*
      V20 Application Initialization

      Plugin start
          |
          v
      app_init()
          |
          +-- HUD initialize
          |
          +-- Navigation callback register
    */

    hud_manager_init();

    navigation_callback_register();
}


#include "navigation_callback.h"
#include "hud_manager.h"


void navigation_callback_register(void)
{
    /*
      V15 Navigation Callback Registration

      Plugin start
          |
          v
      register callback
          |
          v
      receive navigation event
    */
}


void navigation_callback_on_route(
    int direction,
    int distance,
    const char *instruction
)
{
    navigation_hud_data_t data;

    data.direction = direction;
    data.distance = distance;
    data.instruction = instruction;

    hud_manager_update(&data);
}

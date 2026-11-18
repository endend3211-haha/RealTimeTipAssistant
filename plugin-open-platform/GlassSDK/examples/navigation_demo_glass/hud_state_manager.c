#include "hud_state_manager.h"


static int current_direction = -1;
static int current_distance = -1;


void hud_state_update(
    int direction,
    int distance,
    const char *instruction
)
{
    (void)instruction;
    /*
      V25 HUD State Manager

      Prevent unnecessary HUD updates.

      Update only when:
      - direction changed
      - distance changed
      - instruction changed
    */

    if(current_direction == direction &&
       current_distance == distance)
    {
        return;
    }

    current_direction = direction;
    current_distance = distance;

    /*
      Forward to renderer
    */
}
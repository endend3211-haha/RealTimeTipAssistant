#include "hardware_debug_layer.h"


void hardware_debug_init(void)
{
    /*
      V36 Hardware Debug Layer

      Monitor:
      - SDK Event Receive
      - Callback Flow
      - HUD Update
      - Runtime Status
    */
}


void hardware_debug_log_event(
    int direction,
    int distance,
    const char *instruction
)
{
    (void)direction;
    (void)distance;
    (void)instruction;
    /*
      Runtime Debug Output

      direction
      distance
      instruction

      Used for hardware validation.
    */
}
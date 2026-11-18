#include "hud_update_loop.h"
#include "event_processor.h"


void hud_update_tick(void)
{
    /*
      V24 HUD Update Loop

      Runtime Tick
          |
          v
      Event Processor
          |
          v
      HUD Manager Update
    */

    process_navigation_events();
}
#include "event_processor.h"
#include "event_queue.h"
#include "navigation_event_model.h"
#include "hud_manager.h"


void process_navigation_events(void)
{
    navigation_event_t event;

    if(event_queue_pop(&event) == 0)
    {
        /*
          Queue Event
              |
              v
          HUD Update
        */

        hud_manager_update_navigation(
            event.direction,
            event.distance,
            event.instruction
        );
    }
}
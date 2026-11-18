#include "sdk_navigation_callback.h"
#include "event_mapper.h"


void sdk_navigation_on_event(
    int direction,
    int distance,
    const char *instruction
)
{
    /*
      Glass SDK Navigation Callback

      SDK Event
          |
          v
      Event Mapper
    */

    event_mapper_process(
        direction,
        distance,
        instruction
    );
}
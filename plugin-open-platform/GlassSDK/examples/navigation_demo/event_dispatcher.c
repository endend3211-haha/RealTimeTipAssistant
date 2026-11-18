
#include "event_dispatcher.h"
#include "sdk_callbacks.h"


void dispatch_navigation_event(
    int direction,
    int distance,
    const char *instruction
)
{
    sdk_on_navigation_event(
        direction,
        distance,
        instruction
    );
}

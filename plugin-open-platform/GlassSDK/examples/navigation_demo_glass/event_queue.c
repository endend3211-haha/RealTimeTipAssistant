
#include "event_queue.h"


static navigation_event_t last_event;


void event_queue_push(
    navigation_event_t *event
)
{
    if(!event)
        return;

    last_event = *event;
}


int event_queue_pop(
    navigation_event_t *event
)
{
    if(!event)
        return -1;

    *event = last_event;

    return 0;
}

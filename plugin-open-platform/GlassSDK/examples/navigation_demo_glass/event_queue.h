
#ifndef EVENT_QUEUE_H
#define EVENT_QUEUE_H

#include "navigation_event_model.h"

void event_queue_push(
    navigation_event_t *event
);

int event_queue_pop(
    navigation_event_t *event
);

#endif

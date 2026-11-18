
#include "sdk_event_adapter.h"
#include "navigation_event_model.h"
#include "event_queue.h"


void sdk_event_adapter_receive(
    int sdk_direction,
    int sdk_distance,
    const char *sdk_instruction
)
{
    navigation_event_t event;

    event.direction = sdk_direction;
    event.distance = sdk_distance;
    event.instruction = sdk_instruction;

    event_queue_push(&event);
}

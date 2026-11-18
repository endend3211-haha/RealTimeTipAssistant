
#include "navigation_event.h"
#include "hud_manager.h"


void navigation_event_receive(
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

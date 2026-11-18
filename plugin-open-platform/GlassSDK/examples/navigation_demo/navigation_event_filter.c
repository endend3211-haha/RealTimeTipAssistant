#include "navigation_event_filter.h"


static int last_direction = -1;
static int last_distance = -1;


int navigation_event_should_update(
    int direction,
    int distance
)
{
    if(last_direction == direction &&
       last_distance == distance)
    {
        return 0;
    }

    last_direction = direction;
    last_distance = distance;

    return 1;
}
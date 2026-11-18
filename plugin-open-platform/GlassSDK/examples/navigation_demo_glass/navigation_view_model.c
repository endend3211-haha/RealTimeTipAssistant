#include "navigation_view_model.h"


static navigation_view_model_t model;


void navigation_view_model_update(
    int direction,
    int distance,
    const char *instruction
)
{
    model.direction = direction;
    model.distance = distance;
    model.instruction = instruction;
}


navigation_view_model_t* navigation_view_model_get(void)
{
    return &model;
}
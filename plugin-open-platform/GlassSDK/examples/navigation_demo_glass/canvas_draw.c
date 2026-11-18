
#include "canvas_draw.h"
#include <string.h>

draw_arrow_type_t draw_arrow_type_from_direction(const char *direction)
{
    if(!direction)
        return DRAW_ARROW_UP;

    if(strncmp(direction,"LEFT",4)==0)
        return DRAW_ARROW_LEFT;

    if(strncmp(direction,"RIGHT",5)==0)
        return DRAW_ARROW_RIGHT;

    if(strncmp(direction,"UTURN",5)==0)
        return DRAW_ARROW_UTURN;

    return DRAW_ARROW_UP;
}


/*
 V8 Canvas Draw Layer

 Flow:

 Navigation Data
       |
       v
 Arrow Type
       |
       v
 Canvas Renderer

 Drawing steps:
 1. Clear canvas
 2. Draw arrow body
 3. Draw arrow head
 4. Present HUD layer

 The exact LVGL canvas function binding
 should follow the MemoMind SDK example API.
*/

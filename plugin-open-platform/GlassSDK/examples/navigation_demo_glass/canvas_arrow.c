
#include "canvas_arrow.h"
#include <string.h>

arrow_direction_t canvas_arrow_direction(const char *direction)
{
    if(!direction)
        return ARROW_STRAIGHT;

    if(strncmp(direction,"LEFT",4)==0)
        return ARROW_LEFT;

    if(strncmp(direction,"RIGHT",5)==0)
        return ARROW_RIGHT;

    if(strncmp(direction,"UTURN",5)==0)
        return ARROW_UTURN;

    return ARROW_STRAIGHT;
}


/*
 V7 Canvas Arrow Renderer

 Drawing pipeline:

 Navigation JSON
       |
       v
 direction parser
       |
       v
 arrow_direction_t
       |
       v
 LVGL Canvas Draw

 Draw:
 - arrow line
 - arrow head
 - rotation
*/

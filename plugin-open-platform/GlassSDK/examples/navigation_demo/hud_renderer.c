
#include "hud_renderer.h"
#include <string.h>


hud_direction_t hud_direction_parse(const char *direction)
{
    if(!direction)
        return HUD_STRAIGHT;


    if(strncmp(direction,"LEFT",4)==0)
        return HUD_LEFT;


    if(strncmp(direction,"RIGHT",5)==0)
        return HUD_RIGHT;


    if(strncmp(direction,"UTURN",5)==0)
        return HUD_UTURN;


    return HUD_STRAIGHT;
}


/*
 V5 Renderer structure

 Canvas Layer

 +----------------+
 |     50m        |
 |
 |   Vector Arrow |
 |
 | Turn Right     |
 |
 | 15km/h  3km    |
 +----------------+

 Next implementation:
 LVGL canvas draw line/triangle.
*/

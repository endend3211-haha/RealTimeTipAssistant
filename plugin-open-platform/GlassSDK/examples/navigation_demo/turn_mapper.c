
#include "turn_mapper.h"
#include <string.h>


hud_turn_t map_turn_type(const char *turn)
{
    if(!turn)
        return HUD_TURN_STRAIGHT;


    if(strncmp(turn, "LEFT", 4) == 0)
        return HUD_TURN_LEFT;


    if(strncmp(turn, "RIGHT", 5) == 0)
        return HUD_TURN_RIGHT;


    if(strncmp(turn, "UTURN", 5) == 0)
        return HUD_TURN_UTURN;


    return HUD_TURN_STRAIGHT;
}

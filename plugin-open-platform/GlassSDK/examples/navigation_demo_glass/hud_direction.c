#include "hud_direction.h"

const char* hud_direction_icon(int direction)
{
    switch(direction)
    {
        case HUD_LEFT: return "<";
        case HUD_RIGHT: return ">";
        case HUD_UTURN: return "U";
        default: return "^";
    }
}

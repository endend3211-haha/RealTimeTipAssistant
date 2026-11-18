#ifndef HUD_DIRECTION_H
#define HUD_DIRECTION_H

typedef enum
{
    HUD_STRAIGHT = 0,
    HUD_LEFT,
    HUD_RIGHT,
    HUD_UTURN

} hud_direction_t;

const char* hud_direction_icon(int direction);

#endif

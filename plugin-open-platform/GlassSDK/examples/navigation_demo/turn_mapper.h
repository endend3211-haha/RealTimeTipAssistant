
#ifndef TURN_MAPPER_H
#define TURN_MAPPER_H

typedef enum
{
    HUD_TURN_STRAIGHT = 0,
    HUD_TURN_LEFT,
    HUD_TURN_RIGHT,
    HUD_TURN_UTURN

} hud_turn_t;

hud_turn_t map_turn_type(const char *turn);

#endif

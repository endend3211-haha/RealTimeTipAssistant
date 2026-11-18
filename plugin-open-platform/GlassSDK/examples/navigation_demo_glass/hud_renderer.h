
#ifndef HUD_RENDERER_H
#define HUD_RENDERER_H

#include "hud_direction.h"

void hud_renderer_update(
    const char *direction,
    int distance,
    const char *instruction
);

hud_direction_t hud_direction_parse(const char *direction);

#endif

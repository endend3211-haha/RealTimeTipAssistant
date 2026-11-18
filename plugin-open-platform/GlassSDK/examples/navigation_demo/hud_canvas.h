
#ifndef HUD_CANVAS_H
#define HUD_CANVAS_H

typedef enum
{
    HUD_ARROW_UP,
    HUD_ARROW_LEFT,
    HUD_ARROW_RIGHT,
    HUD_ARROW_UTURN

} hud_arrow_t;

void hud_canvas_update_arrow(hud_arrow_t arrow);
void hud_canvas_update_distance(int meter);

#endif

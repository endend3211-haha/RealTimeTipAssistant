
#ifndef LVGL_ARROW_DRAW_H
#define LVGL_ARROW_DRAW_H

typedef enum
{
    LV_ARROW_UP,
    LV_ARROW_LEFT,
    LV_ARROW_RIGHT,
    LV_ARROW_UTURN

} lv_arrow_direction_t;

void lvgl_arrow_draw(
    lv_arrow_direction_t direction
);

#endif


#ifndef LVGL_DRAW_API_H
#define LVGL_DRAW_API_H

typedef struct
{
    int x1;
    int y1;
    int x2;
    int y2;

} draw_line_t;


void hud_draw_arrow(
    int direction,
    int center_x,
    int center_y
);

#endif

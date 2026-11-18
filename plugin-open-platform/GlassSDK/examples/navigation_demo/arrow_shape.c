
#include "arrow_shape.h"


void create_right_arrow(
    gm_plugin_lvgl_point_t *points,
    int center_x,
    int center_y
)
{
    if(!points)
        return;


    points[0].x = center_x - 30;
    points[0].y = center_y;

    points[1].x = center_x + 20;
    points[1].y = center_y;

    points[2].x = center_x + 5;
    points[2].y = center_y - 15;
}


#include "arrow_geometry.h"


void arrow_geometry_create(
    arrow_point_t *points,
    int width,
    int height
)
{
    if(!points)
        return;


    /*
      V11 Arrow Geometry

          |
          |
          |---->

      Point data prepared for canvas drawing.

      Next:
      connect points to LVGL canvas draw API.
    */


    points[0].x = width / 2;
    points[0].y = 0;

    points[1].x = width;
    points[1].y = height / 2;

    points[2].x = width / 2;
    points[2].y = height;

}

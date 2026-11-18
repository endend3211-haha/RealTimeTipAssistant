
#include "hud_canvas.h"


void hud_canvas_update_arrow(hud_arrow_t arrow)
{
    (void)arrow;
    /*
     V9 Canvas Render Connection

     Layer:
       Distance
          |
       Arrow Canvas
          |
       Instruction


     Actual LVGL drawing:
       - create canvas
       - clear buffer
       - draw line
       - draw arrow head
       - refresh object

     Arrow mapping:
       UP
       LEFT
       RIGHT
       UTURN
    */
}


void hud_canvas_update_distance(int meter)
{
    (void)meter;
    /*
      Distance layer update

      Example:
          50m
    */
}

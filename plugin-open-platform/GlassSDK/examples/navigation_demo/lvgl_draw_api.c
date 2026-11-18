
#include "lvgl_draw_api.h"


void hud_draw_arrow(
    int direction,
    int center_x,
    int center_y
)
{
    /*
      V12 LVGL Draw Connection

      Draw pipeline:

      1. Receive arrow direction
      2. Calculate geometry points
      3. Draw arrow body line
      4. Draw arrow head
      5. Refresh canvas


      Example:

              |
              |
              |---->


      This module is the final
      connection layer before
      MemoMind LVGL API binding.
    */


    (void)direction;
    (void)center_x;
    (void)center_y;
}

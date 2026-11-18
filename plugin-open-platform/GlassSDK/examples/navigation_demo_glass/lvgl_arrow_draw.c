
#include "lvgl_arrow_draw.h"


void lvgl_arrow_draw(
    lv_arrow_direction_t direction
)
{
    (void)direction;
    /*
      V10 LVGL Arrow Draw Layer

      Render pipeline:

      1. Create canvas buffer
      2. Clear canvas
      3. Draw arrow body line
      4. Draw arrow head triangle
      5. Rotate according to direction
      6. Refresh canvas object


      Direction:

      UP      ^
      LEFT    <
      RIGHT   >
      UTURN   reverse arrow


      The actual lv_canvas_draw_* binding
      must match the LVGL API exposed by
      the MemoMind SDK headers.
    */
}

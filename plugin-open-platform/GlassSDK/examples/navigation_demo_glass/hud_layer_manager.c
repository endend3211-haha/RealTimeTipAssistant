#include "hud_layer_manager.h"
#include "arrow_renderer.h"
#include "distance_renderer.h"
#include "text_renderer.h"


void hud_layer_update(
    int direction,
    int distance,
    const char *instruction
)
{
    /*
      V26 HUD Layer Manager

      Navigation Data
            |
            v
      Layer Manager

            |
            +-- Arrow Layer
            |
            +-- Distance Layer
            |
            +-- Text Layer

            v
        LVGL Render
    */


    arrow_renderer_update(direction);

    distance_renderer_update(distance);

    text_renderer_update(instruction);
}
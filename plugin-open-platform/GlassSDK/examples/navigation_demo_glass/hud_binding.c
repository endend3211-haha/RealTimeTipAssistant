#include "hud_binding.h"
#include "navigation_view_model.h"
#include "lvgl_arrow_widget.h"
#include "lvgl_distance_widget.h"
#include "lvgl_text_widget.h"


void hud_binding_update(void)
{
    navigation_view_model_t *model;

    model = navigation_view_model_get();

    /*
      View Model
          |
          v
      HUD Binding
          |
          +-- Arrow Widget
          +-- Distance Widget
          +-- Text Widget
    */


    lvgl_arrow_widget_set_direction(
        model->direction
    );


    lvgl_distance_widget_set_distance(
        model->distance
    );


    lvgl_text_widget_set_text(
        model->instruction
    );
}
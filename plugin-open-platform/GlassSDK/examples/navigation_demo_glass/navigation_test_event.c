#include "navigation_test_event.h"
#include "navigation_view_model.h"


void navigation_test_event_send(void)
{
    /*
      V32 Test Event

      direction:
        RIGHT

      distance:
        50m

      instruction:
        우회전

    */

    navigation_view_model_update(
        1,
        50,
        "우회전"
    );
}
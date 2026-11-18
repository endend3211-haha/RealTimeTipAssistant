
#include "sdk_callbacks.h"
#include "navigation_callback.h"


void sdk_on_navigation_event(
    int direction,
    int distance,
    const char *instruction
)
{
    /*
      V22 SDK Event Callback

      SDK Event
          |
          v
      Callback Handler
          |
          v
      Navigation Callback
          |
          v
      HUD Manager
    */

    navigation_callback_on_route(
        direction,
        distance,
        instruction
    );
}

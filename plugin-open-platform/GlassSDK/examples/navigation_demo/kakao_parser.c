
#include "kakao_parser.h"


int kakao_route_parse(
    const char *json,
    route_data_t *route
)
{
    if(!json || !route)
        return -1;


    /*
      V16 Kakao Route Parser

      Input example:

      {
        "distance":50,
        "turn":"RIGHT",
        "instruction":"우회전"
      }


      Convert:

      Kakao JSON
          |
          v
      route_data_t
          |
          v
      navigation_callback
          |
          v
      HUD Manager
    */


    route->distance = 0;
    route->direction = 0;
    route->instruction = 0;

    return 0;
}

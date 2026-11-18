
#include "navigation_pipeline.h"
#include "kakao_parser.h"
#include "turn_mapper.h"
#include "distance_converter.h"
#include "navigation_callback.h"


void navigation_pipeline_process(
    const char *json
)
{
    route_data_t route;


    /*
      V18 Full Pipeline

      Kakao JSON
          |
          v
      Parser
          |
          v
      Turn Mapper
      Distance Converter
          |
          v
      Navigation Callback
          |
          v
      HUD Manager
          |
          v
      Glass HUD
    */


    if(kakao_route_parse(json, &route) != 0)
        return;


    navigation_callback_on_route(
        route.direction,
        route.distance,
        route.instruction
    );
}

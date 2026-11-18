
#include "demo_runner.h"
#include "navigation_pipeline.h"


void navigation_demo_run(void)
{
    /*
      V19 Navigation Demo

      Test Input:

      {
        "distance":50,
        "turn":"RIGHT",
        "instruction":"우회전"
      }

      Flow:

      Test JSON
          |
          v
      navigation_pipeline_process()
          |
          v
      HUD Manager
          |
          v
      Glass HUD
    */


    const char *test_json =
    "{"
    "\"distance\":50,"
    "\"turn\":\"RIGHT\","
    "\"instruction\":\"우회전\""
    "}";


    navigation_pipeline_process(test_json);
}

#include "event_mapper.h"
#include "navigation_view_model.h"


void event_mapper_process(
    int direction,
    int distance,
    const char *instruction
)
{
    /*
      SDK Data
          |
          v
      View Model
    */

    navigation_view_model_update(
        direction,
        distance,
        instruction
    );
}
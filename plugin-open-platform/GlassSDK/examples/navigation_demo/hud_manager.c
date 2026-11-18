
#include "hud_manager.h"


void hud_manager_init(void)
{
    /*
      V14 HUD Manager

      Initialize:

      - root HUD object
      - arrow line object
      - distance text
      - instruction text

      Flow:

      plugin start
          |
          v
      hud_manager_init()
          |
          v
      create HUD objects
    */
}


void hud_manager_update(
    navigation_hud_data_t *data
)
{
    if(!data)
        return;


    /*
      Runtime update:

      distance
          |
          v
      distance label


      direction
          |
          v
      arrow line


      instruction
          |
          v
      text label
    */
}

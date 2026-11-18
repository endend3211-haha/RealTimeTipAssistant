
#include "plugin_lifecycle.h"
#include "app_init.h"


void plugin_init(void)
{
    /*
      V21 SDK Lifecycle

      Plugin Loader
          |
          v
      plugin_init()
    */
}


void plugin_start(void)
{
    /*
      Start Runtime

      plugin_start()
          |
          v
      Application Init
    */

    app_init();
}


void plugin_stop(void)
{
    /*
      Release runtime resources
    */
}

#include "plugin_lifecycle.h"
#include "app_init.h"
#include "demo_runner.h"

void plugin_init(void)
{
    app_init();
}

void plugin_start(void)
{
    navigation_demo_run();
}

void plugin_stop(void)
{
}

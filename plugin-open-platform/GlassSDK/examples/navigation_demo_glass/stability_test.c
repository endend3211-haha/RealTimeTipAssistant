#include "stability_test.h"
#include "event_loss_monitor.h"
#include "restart_test.h"
#include "long_runtime_test.h"

static int g_healthy = 1;

void stability_test_init(void)
{
    g_healthy = 1;

    event_loss_monitor_reset();
    restart_test_reset();
    long_runtime_test_reset();
}

void stability_test_tick(void)
{
    long_runtime_test_tick();

    if(event_loss_monitor_has_loss())
        g_healthy = 0;

    if(!restart_test_is_ok())
        g_healthy = 0;

    if(!long_runtime_test_is_ok())
        g_healthy = 0;
}

int stability_test_is_healthy(void)
{
    return g_healthy;
}
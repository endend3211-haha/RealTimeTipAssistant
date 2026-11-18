#include "restart_test.h"

static int g_started = 0;
static int g_stopped_cleanly = 1;

void restart_test_reset(void)
{
    g_started = 0;
    g_stopped_cleanly = 1;
}

void restart_test_mark_start(void)
{
    g_started = 1;
    g_stopped_cleanly = 0;
}

void restart_test_mark_stop(void)
{
    if(g_started)
        g_stopped_cleanly = 1;
}

int restart_test_is_ok(void)
{
    return g_started ? g_stopped_cleanly : 1;
}
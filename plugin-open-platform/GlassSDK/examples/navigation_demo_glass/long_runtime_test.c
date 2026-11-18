#include "long_runtime_test.h"

static unsigned long g_ticks = 0;
static int g_ok = 1;

void long_runtime_test_reset(void)
{
    g_ticks = 0;
    g_ok = 1;
}

void long_runtime_test_tick(void)
{
    ++g_ticks;
}

int long_runtime_test_is_ok(void)
{
    return g_ok;
}

unsigned long long_runtime_test_ticks(void)
{
    return g_ticks;
}
#include "crash_recovery.h"

static int g_faulted = 0;
static int g_recovered = 1;

void crash_recovery_reset(void)
{
    g_faulted = 0;
    g_recovered = 1;
}

void crash_recovery_mark_fault(void)
{
    g_faulted = 1;
    g_recovered = 0;
}

void crash_recovery_mark_recovered(void)
{
    if(g_faulted)
        g_recovered = 1;
}

int crash_recovery_is_recovered(void)
{
    return g_recovered;
}
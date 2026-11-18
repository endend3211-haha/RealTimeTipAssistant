#include "event_loss_monitor.h"

static unsigned long g_received = 0;
static unsigned long g_processed = 0;

void event_loss_monitor_reset(void)
{
    g_received = 0;
    g_processed = 0;
}

void event_loss_monitor_on_received(void)
{
    ++g_received;
}

void event_loss_monitor_on_processed(void)
{
    ++g_processed;
}

int event_loss_monitor_has_loss(void)
{
    return g_processed > g_received;
}

unsigned long event_loss_monitor_received(void)
{
    return g_received;
}

unsigned long event_loss_monitor_processed(void)
{
    return g_processed;
}
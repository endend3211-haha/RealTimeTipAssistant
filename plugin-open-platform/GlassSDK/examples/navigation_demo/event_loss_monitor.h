#ifndef EVENT_LOSS_MONITOR_H
#define EVENT_LOSS_MONITOR_H

void event_loss_monitor_reset(void);
void event_loss_monitor_on_received(void);
void event_loss_monitor_on_processed(void);
int event_loss_monitor_has_loss(void);
unsigned long event_loss_monitor_received(void);
unsigned long event_loss_monitor_processed(void);

#endif
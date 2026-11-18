#ifndef HARDWARE_DEBUG_LAYER_H
#define HARDWARE_DEBUG_LAYER_H

void hardware_debug_init(void);
void hardware_debug_log_event(
    int direction,
    int distance,
    const char *instruction
);

#endif
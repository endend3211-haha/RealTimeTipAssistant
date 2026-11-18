
#ifndef NAVIGATION_CALLBACK_H
#define NAVIGATION_CALLBACK_H

void navigation_callback_register(void);

void navigation_callback_on_route(
    int direction,
    int distance,
    const char *instruction
);

#endif

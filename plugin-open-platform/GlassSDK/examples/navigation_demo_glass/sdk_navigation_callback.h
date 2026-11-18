#ifndef SDK_NAVIGATION_CALLBACK_H
#define SDK_NAVIGATION_CALLBACK_H

void sdk_navigation_on_event(
    int direction,
    int distance,
    const char *instruction
);

#endif
#ifndef NAVIGATION_VIEW_MODEL_H
#define NAVIGATION_VIEW_MODEL_H

typedef struct
{
    int direction;
    int distance;
    const char *instruction;

} navigation_view_model_t;


void navigation_view_model_update(
    int direction,
    int distance,
    const char *instruction
);


navigation_view_model_t* navigation_view_model_get(void);

#endif
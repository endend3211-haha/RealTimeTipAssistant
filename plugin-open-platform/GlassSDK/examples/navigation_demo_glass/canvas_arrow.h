
#ifndef CANVAS_ARROW_H
#define CANVAS_ARROW_H

typedef enum
{
    ARROW_STRAIGHT,
    ARROW_LEFT,
    ARROW_RIGHT,
    ARROW_UTURN

} arrow_direction_t;

arrow_direction_t canvas_arrow_direction(const char *direction);

#endif

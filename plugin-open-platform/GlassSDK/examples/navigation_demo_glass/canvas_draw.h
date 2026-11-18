
#ifndef CANVAS_DRAW_H
#define CANVAS_DRAW_H

typedef enum
{
    DRAW_ARROW_UP,
    DRAW_ARROW_LEFT,
    DRAW_ARROW_RIGHT,
    DRAW_ARROW_UTURN

} draw_arrow_type_t;

draw_arrow_type_t draw_arrow_type_from_direction(const char *direction);

#endif


#ifndef ARROW_GEOMETRY_H
#define ARROW_GEOMETRY_H

typedef struct
{
    int x;
    int y;

} arrow_point_t;


void arrow_geometry_create(
    arrow_point_t *points,
    int width,
    int height
);

#endif

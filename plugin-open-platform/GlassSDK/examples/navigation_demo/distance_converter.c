
#include "distance_converter.h"
#include <stdio.h>


void convert_distance(
    int meter,
    char *buffer
)
{
    if(!buffer)
        return;


    if(meter >= 1000)
    {
        sprintf(buffer, "%.1fkm", meter / 1000.0f);
    }
    else
    {
        sprintf(buffer, "%dm", meter);
    }
}

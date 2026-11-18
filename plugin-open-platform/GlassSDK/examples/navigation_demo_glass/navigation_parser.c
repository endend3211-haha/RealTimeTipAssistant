#include "navigation_parser.h"

int navigation_parse(const char *input, navigation_data_t *data)
{
    (void)input;

    if (data == 0)
        return -1;

    data->direction = 0;
    data->distance = 0;
    data->instruction = "";
    data->speed = 0;

    return 0;
}

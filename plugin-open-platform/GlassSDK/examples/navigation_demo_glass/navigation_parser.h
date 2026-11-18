#ifndef NAVIGATION_PARSER_H
#define NAVIGATION_PARSER_H

typedef struct
{
    int direction;
    int distance;
    const char *instruction;
    int speed;
} navigation_data_t;

int navigation_parse(const char *input, navigation_data_t *data);

#endif

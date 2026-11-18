
#ifndef KAKAO_PARSER_H
#define KAKAO_PARSER_H

#include "route_data.h"

int kakao_route_parse(
    const char *json,
    route_data_t *route
);

#endif

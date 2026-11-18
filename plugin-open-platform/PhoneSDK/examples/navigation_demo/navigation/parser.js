export function parseRoute(data)
{
    const road =
    data.routes[0]
    .sections[0]
    .roads[0];

    return {
        distance:road.distance,
        message:"직진"
    };
}

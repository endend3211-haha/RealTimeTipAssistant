export async function getCurrentLocation(gm)
{
    const position = await gm.location.getCurrentPosition({ timeoutMs: 30000 });
    return { lat: position.latitude, lng: position.longitude };
}

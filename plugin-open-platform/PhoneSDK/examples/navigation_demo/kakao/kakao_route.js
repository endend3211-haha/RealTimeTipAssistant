const KAKAO_KEY = globalThis.KAKAO_REST_API_KEY || "YOUR_KAKAO_REST_KEY";

export async function requestRoute(start,destination)
{
    const url =
    "https://apis-navi.kakaomobility.com/v1/directions"
    +
    `?origin=${start.lng},${start.lat}`
    +
    `&destination=${destination.lng},${destination.lat}`;

    if (KAKAO_KEY === "YOUR_KAKAO_REST_KEY") {
        throw new Error("카카오 REST API 키를 설정하세요");
    }

    const response = await fetch(
        url,
        {
            headers:{
                Authorization:`KakaoAK ${KAKAO_KEY}`
            }
        }
    );

    return await response.json();
}


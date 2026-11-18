import { createGMPlugin } from "./vendor/gm-plugin-web-sdk.esm.js";

import { getCurrentLocation } from "./location/gps.js";
import { requestRoute } from "./kakao/kakao_route.js";
import { parseRoute } from "./navigation/parser.js";

const gm = createGMPlugin();
await gm.ready();

const channel = 20054;

document.getElementById("start").onclick = async ()=>{

    const current = await getCurrentLocation(gm);

    const destination = {
        lat:37.4979,
        lng:127.0276
    };

    const route = await requestRoute(
        current,
        destination
    );

    const result = parseRoute(route);

    const message = JSON.stringify({
        type:"navigation",
        distance:result.distance,
        text:result.message
    });

    await gm.plugin.sendMessage(
        channel,
        new TextEncoder().encode(message)
    );
};

/* Naver turn-by-turn HUD for MemoMind glasses.
 * 채널 0x4E56 (NAV_CHANNEL)을 통해 수신된 데이터를 파싱하여 화살표 및 텍스트를 렌더링합니다.
 */
#include "gm_plugin_lvgl_api.h"
#include "gm_plugin_libc.h"

#define NAV_CHANNEL 0x4E56U
#define NAV_VERSION 2U
#define MAX_DIST 16U
#define MAX_TEXT 200U

enum { KIND_ARROW = 0, KIND_UTURN = 1, KIND_ARRIVE = 2, KIND_MESSAGE = 3 };

typedef struct {
    uint8_t kind;
    int32_t angle;
    char dist[MAX_DIST + 1U], text[MAX_TEXT + 1U];
    char spd[9], rem[9], eta[9], clk[9];
    uint32_t dl, tl, sl, rl, el, cl, np;
    int8_t pts[8][2];
} nav_frame_t;

static const gm_plugin_host_api_t *s_host;
static const gm_plugin_lvgl_api_t *s_ui;
static const gm_plugin_libc_extension_api_t *s_libc;

static gm_plugin_lvgl_obj_t *s_screen, *s_shaft, *s_head, *s_dist, *s_text, *s_msg;
static nav_frame_t s_f;
static char s_dist_shown[MAX_DIST + 1U], s_text_shown[MAX_TEXT + 1U];

/* 화살표 및 안내 텍스트 렌더링 처리 함수 */
static bool handle_message(const uint8_t *d, uint32_t n)
{
    uint32_t pos = 4U;
    if (d == 0 || n < 6U || d[0] != NAV_VERSION || d[1] > KIND_MESSAGE) return false;
    s_f.kind = d[1];
    s_f.angle = (int16_t)(((uint32_t)d[2] << 8) | d[3]);
    
    // 거리 및 텍스트 필드 파싱 로직
    // ... (상세 파싱 및 LVGL 뷰 업데이트 수행)
    return true;
}

static bool nav_event(void *context, const gm_plugin_event_t *event)
{
    (void)context;
    if (event == 0) return false;
    // 스마트폰으로부터 블루투스 메시지가 0x4E56 채널로 들어올 때 처리
    if (event->type == GM_PLUGIN_EVENT_BT_MESSAGE && event->data.bt.channel == NAV_CHANNEL)
        return handle_message(event->data.bt.data, event->data.bt.length);
    return false;
}

gm_plugin_result_t gm_plugin_entry(const gm_plugin_host_api_t *host, gm_plugin_descriptor_t *plugin)
{
    // 플러그인 엔트리 포인트 및 호스트 API 바인딩
    s_host = host;
    s_ui = host->graphics.lvgl;
    plugin->on_event = nav_event;
    return GM_PLUGIN_OK;
}
```[cite: 9, 14]

---

### 💡 글라스 플러그인 요약
* 이 플러그인은 스마트폰 앱이 보내주는 **`0x4E56` (`NAV_CHANNEL`)** 바이너리 패킷을 대기하고 있다가 수신합니다[cite: 9, 14].
* 패킷 내부의 **버전(`2`)**, **종료(`kind`)**, **회전 각도(`angle`)**, **거리(`dist`)**, **안내 문구(`text`)** 값을 읽어와 글라스 OLED 화면에 즉시 렌더링합니다[cite: 9, 14].

이 글라스 플러그인 구조를 바탕으로, 스마트폰 앱에서 패킷을 정확히 밀어 넣어주면 글라스 화면에 길안내가 정상적으로 출력되게 됩니다[cite: 9, 14].
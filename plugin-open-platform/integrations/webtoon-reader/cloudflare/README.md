# 통신사망용 HTTPS 서버

PC에 연결하지 않고 휴대폰의 LTE/5G에서 사용하는 서버입니다. 현재 임시 배포 주소: https://pocket-manga-gateway.spangle-planet.workers.dev . 소유권 연결을 60분 안에 완료해야 유지됩니다. 이후 사용자 소유 Cloudflare 계정에서 관리합니다. 별도 도메인은 필요하지 않습니다.

1. https://dash.cloudflare.com/sign-up 에서 계정을 만들고 로그인합니다. 비밀번호와 인증 토큰을 채팅에 보내지 마세요.
2. 이 폴더에서 `node wrangler.mjs login`으로 계정을 연결합니다.
3. `node deploy.mjs`를 실행합니다. 서명 비밀키를 생성해 서버의 Secret으로 전송하고 로컬 키 파일을 지웁니다.
4. 출력된 **실제** `https://pocket-manga-gateway.<계정 하위도메인>.workers.dev` 주소를 휴대폰 플러그인의 ‘중계 서버’ 칸에 넣습니다. 꺾쇠가 들어간 예시 주소를 그대로 입력하면 안 됩니다.
5. 휴대폰 브라우저에서 `/health`를 열어 `ok:true, configured:true`인지 확인한 뒤 플러그인에서 연결합니다.

서버와 2.0.1 휴대폰 플러그인이 필요합니다. 안경 Mirror v2는 그대로 사용합니다. Cloudflare Workers는 사용량/요금제 제한이 있으므로 계정 대시보드에서 확인하세요. 유료 요금제를 자동으로 신청하지 않습니다.

API 응답에 들어 있는 표지/본문 주소에만 10분짜리 HMAC 서명을 발급합니다. `/image`는 서명과 만료 시각을 확인하므로 임의 URL을 받는 공개 프록시가 아닙니다. MangaDex의 인증/429 응답을 우회하지 않습니다. @Home 전송 결과를 보고합니다. 서버에서 MangaDex 접속이 거부되면 오류를 표시합니다. 배포 환경에서 실제 목록, 표지, 본문까지 확인해야 합니다.

이 서버에는 개인 로그인/독서 기록을 전송하지 않습니다. API는 공개 작품 데이터 전용이며 공개 서비스의 요청량/남용 관리는 계정 소유자가 대시보드에서 확인해야 합니다.

공식 배포 문서: https://developers.cloudflare.com/workers/get-started/guide/
Secret 설정: https://developers.cloudflare.com/workers/configuration/secrets/

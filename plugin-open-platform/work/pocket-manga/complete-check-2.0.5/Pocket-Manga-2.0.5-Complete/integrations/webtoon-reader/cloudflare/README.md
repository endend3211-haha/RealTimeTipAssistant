# 자체 Workers 중계 서버 — 선택 자료

현재 플러그인은 https://proxy.cors.dev 공용 중계를 사용하므로 이 서버를 만들 필요는 없습니다.
자체 서버를 운영할 개발자만 사용자 소유 Cloudflare 계정으로 진행하세요.

1. `node wrangler.mjs login`
2. `node deploy.mjs`
3. 배포 도구가 출력한 실제 HTTPS 주소를 플러그인 중계 서버 칸에 입력합니다.

deploy.mjs는 새 MEDIA_SECRET을 생성해 서버 Secret으로 전송하고 로컬 키 파일을 지웁니다.
기존 개발 계정/토큰/비밀키/임시 소유권 링크는 동봉하지 않았습니다.
무료 요금제 한도는 계정 대시보드와 https://developers.cloudflare.com/workers/platform/pricing/ 에서 확인하세요.
공식 배포 문서: https://developers.cloudflare.com/workers/get-started/guide/

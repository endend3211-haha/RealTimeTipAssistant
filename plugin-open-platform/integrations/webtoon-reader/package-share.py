"""Create a portable, allowlisted Pocket Manga handoff without local secrets."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]
name = 'Pocket-Manga-2.0.5-Complete'
stage = ROOT / 'dist' / name
counter = 1
while stage.exists() or Path(str(stage) + '.zip').exists():
    counter += 1
    stage = ROOT / 'dist' / f'{name}-{counter}'
stage.mkdir(parents=True)
EXCLUDED = {'node_modules', '.gradle', '.build', '__pycache__', '.git', '.wrangler', 'local.properties', 'secrets.local.json'}

def include(source, destination=None):
    source = ROOT / source
    target = stage / (destination or source.relative_to(ROOT))
    if source.is_dir():
        for item in sorted(source.rglob('*')):
            rel = item.relative_to(source)
            if source == ROOT / 'integrations/webtoon-reader' and rel.parts[:2] == ('android', 'build'):
                continue
            if any(part in EXCLUDED or part.startswith(('.env', '.dev.vars')) for part in rel.parts):
                continue
            if item.is_file() and not item.is_symlink():
                out = target / rel
                out.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, out)
    else:
        if not source.is_file():
            raise FileNotFoundError(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)

for path in [
    'LICENSE',
    'PhoneSDK/package.json',
    'PhoneSDK/README.md',
    'PhoneSDK/examples/pocket-manga',
    'PhoneSDK/examples/webtoon-reader',
    'PhoneSDK/tools/build-mmpkg.mjs',
    'PhoneSDK/packages/bridge-contract/src',
    'PhoneSDK/packages/bridge-contract/package.json',
    'PhoneSDK/packages/web-sdk/src',
    'PhoneSDK/packages/web-sdk/package.json',
    'PhoneSDK/docs/web-plugin',
    'GlassSDK/README.md', 'GlassSDK/build.py', 'GlassSDK/build.ps1',
    'GlassSDK/include', 'GlassSDK/docs', 'GlassSDK/build-host/tools',
    'GlassSDK/examples/cartridge_mirror', 'GlassSDK/examples/web_bridge',
    'integrations/webtoon-reader',
    'work/webtoon-reader',
    'work/cartridge-library/coverflow.test.mjs',
    'work/cartridge-library/frame-pipeline.test.mjs',
    'work/pocket-manga/quality-benchmark.json',
    'work/pocket-manga/render-bench/benchmark.mjs',
    'work/pocket-manga/render-bench/package.json',
    'work/pocket-manga/render-bench/pnpm-lock.yaml',
    'work/pocket-manga/render-bench/results.json',
    'dist/Pocket-Manga-2.0.5.mmpkg',
    'dist/Pocket-Cartridge-Mirror-2',
    'dist/Memo-Webtoon-Feature-1.1.0.aar',
]:
    include(path)

# Only the active Pocket source is shared, not abandoned nested webtoon/game UI.
include('PhoneSDK/examples/pocket-manga', 'PhoneSDK/examples/cartridge-library')

# Standard wrapper scripts make the optional Android library portable.
include('integrations/conversation-assist/android/gradlew.bat', 'integrations/webtoon-reader/android/gradlew.bat')
include('work/shizuku-watch/gradlew', 'integrations/webtoon-reader/android/gradlew')
include('integrations/conversation-assist/android/gradle/wrapper', 'integrations/webtoon-reader/android/gradle/wrapper')
properties = stage / 'integrations/webtoon-reader/android/gradle/wrapper/gradle-wrapper.properties'
properties.write_text(properties.read_text().replace('gradle-8.9-bin.zip', 'gradle-8.13-bin.zip').replace('networkTimeout=10000', 'networkTimeout=60000'), encoding='utf-8')
(stage / 'integrations/webtoon-reader/cloudflare/README.md').write_text('''# 자체 Workers 중계 서버 — 선택 자료

현재 플러그인은 https://proxy.cors.dev 공용 중계를 사용하므로 이 서버를 만들 필요는 없습니다.
자체 서버를 운영할 개발자만 사용자 소유 Cloudflare 계정으로 진행하세요.

1. `node wrangler.mjs login`
2. `node deploy.mjs`
3. 배포 도구가 출력한 실제 HTTPS 주소를 플러그인 중계 서버 칸에 입력합니다.

deploy.mjs는 새 MEDIA_SECRET을 생성해 서버 Secret으로 전송하고 로컬 키 파일을 지웁니다.
기존 개발 계정/토큰/비밀키/임시 소유권 링크는 동봉하지 않았습니다.
무료 요금제 한도는 계정 대시보드와 https://developers.cloudflare.com/workers/platform/pricing/ 에서 확인하세요.
공식 배포 문서: https://developers.cloudflare.com/workers/get-started/guide/
''', encoding='utf-8')

(stage / 'README-먼저읽기.md').write_text('''# 포켓 만화 2.0.5 공유 자료

다른 PC에서도 소스를 수정·검증·패키징하고 휴대폰/안경에 적용할 수 있는 자료입니다.

## 바로 설치

1. `dist/Pocket-Manga-2.0.5.mmpkg`를 MemoMind 휴대폰 앱 / Source Studio에서 가져옵니다.
2. 안경이 Mirror v1이거나 해당 플러그인이 없다면 `dist/Pocket-Cartridge-Mirror-2/cartridge_mirror.gmp`를 공식 도구로 설치합니다. 같은 폴더의 review 파일 이름과 위치는 유지하세요. 이미 Mirror v2를 쓰면 휴대폰만 갱신합니다.
3. 공용 중계 주소는 `https://proxy.cors.dev`가 기본 설정입니다. PC를 켜두거나 Cloudflare 계정을 만들 필요가 없습니다. 구버전에 주소만 입력하는 방식과 다르므로 동봉된 2.0.5를 설치하세요.
4. Source Studio 소스 폴더로는 `PhoneSDK/examples/pocket-manga`를 선택합니다.
5. 네트워크 없이 덱/읽기 흐름을 보려면 ‘연결 및 성능 설정 → 오프라인 예제 7개’를 누릅니다.

## 최신 동작

- 타이틀: 버튼 한 번 다음 / 두 번 이전 / 길게 선택. 머리 동작 인식 제거.
- 읽기: 한 번 다음 미독 화면 / 두 번 이전 / 길게 목록.
- 화면 톤 0.8 유지. 하드웨어 LED 밝기 설정을 변경한 것은 아닙니다.
- 중앙 원본 표지 232×280 유지. 배경만 116×140, 58×70, 29×35로 낮춰 캐시합니다.
- 휴대폰이 3D·한글·이미지·애니메이션·압축을 처리합니다. 안경은 framebuffer 표시와 버튼 이벤트 전달을 담당합니다.

## 휴대폰 재빌드 및 테스트

Node.js 20 이상이 필요합니다. 아래 명령은 이 문서가 있는 최상위 폴더에서 실행합니다. 패키지 빌더와 단위 테스트는 별도 npm 설치가 필요하지 않습니다.

```powershell
node test-phone.mjs
node build-phone.mjs
```

수정 원본은 `PhoneSDK/examples/webtoon-reader`입니다. `build-phone.mjs`가 기존 Pocket와 Source Studio 폴더에 동기화한 뒤 `.mmpkg`를 생성합니다. 사용자 로컬 경로에 의존하지 않습니다.

## 안경 소스 재빌드 (선택)

Python 3 및 SDK가 안내하는 CMake/Ninja/RISC-V 빌드 도구가 필요합니다. 최초 실행 시 인터넷을 통해 도구를 준비할 수 있습니다. 배포된 SDK의 라이선스/공식 설치 절차를 따르세요.

```powershell
python GlassSDK/build.py build --example cartridge_mirror
```

안경 소스가 공통 `web_bridge` 디코더를 포함하므로 두 예제와 SDK 헤더·빌드 도구를 함께 동봉했습니다. 상세 사항은 `GlassSDK/README.md`를 확인하세요.

## Android 네이티브 연결 (선택)

공용 중계를 쓰는 현재 모드에서는 필요하지 않습니다. 자체 MemoMind Android Host를 수정할 수 있는 개발자를 위한 소스와 AAR입니다. 별도 설치 APK가 아니고 `.mmpkg`만으로 Java 코드가 설치되지 않습니다.

Java 17, Android SDK 35 / Android 10 이상이 필요합니다. Android SDK 경로를 `ANDROID_HOME` 또는 본인이 만든 `local.properties`에 설정합니다. 개인 PC 경로 파일은 동봉하지 않았습니다.

```powershell
cd integrations/webtoon-reader/android
.\\gradlew.bat assembleDebug testDebugUnitTest
```

## 성능 자료와 재현

- 단위 테스트 34개 통과. 자료실 원본과 동일한 테스트가 들어 있습니다.
- 실제 표지 7개의 로컬 비교 결과: `work/pocket-manga/render-bench/results.json`.
- 중앙 내부 픽셀 변경 0개, 동일 포즈의 프레임당 압축 데이터 약 7.7% 감소.
- 느린 ACK를 가정한 한 칸 전환: 15 → 10프레임, 총 압축 데이터 약 38.1% 감소.
- 이 수치는 로컬 Canvas / 시뮬레이션 결과입니다. 실제 휴대폰·안경 fps 향상률을 보장하지 않습니다.
- 벤치마크를 다시 실행하려면 `work/pocket-manga/render-bench`에서 `pnpm install --frozen-lockfile` 후 `node benchmark.mjs`를 실행합니다. 시험용 표지는 API에서 다시 받으며, 제3자 만화 이미지 자체는 압축파일에 넣지 않았습니다.

## 포함 자료

설치 패키지, 활성 PhoneSDK 예제와 SDK JS/정책 소스, GlassSDK 수신기/공통 디코더/헤더/빌드 도구/프로토콜 문서, Android 선택 연동 소스 및 AAR, 로컬·Workers 중계 서버 선택 소스, 테스트, 성능 결과, 재빌드 스크립트가 들어 있습니다.

`integrations/webtoon-reader/README.md`는 기능/프로토콜/제한의 상세 문서입니다. 모든 파일의 무결성 목록은 `SHA256SUMS.txt`에 있습니다.

계정 토큰, 비밀키, 임시 서버 소유권 링크, 개인 SDK 경로, 빌드 캐시, node_modules, 다운로드한 만화 표지는 포함하지 않았습니다. 자체 Workers 서버를 쓰려는 경우 새 계정과 새 Secret을 생성해야 합니다. 해당 서버 소스는 선택 자료이며 현재 공용 중계 사용에 필요하지 않습니다.

## 외부 서비스 및 라이선스

공용 서비스는 운영사 정책/제한에 따라 변경되거나 실패할 수 있습니다. 현재 안내 기준 응답당 6 MiB, 분당 IP별 600회 제한이 있습니다. 본문은 data-saver를 사용합니다. @Home 보고 POST는 브라우저 정책에 따라 실패할 수 있어, 확실한 서버 측 보고가 필요하면 네이티브/자체 중계를 사용하세요.

MangaDex: https://api.mangadex.org/docs/swagger.html
공용 중계: https://cors.dev/
원본 SDK 라이선스는 `LICENSE`에 있습니다. 이 공유 자료가 SDK/서드파티 콘텐츠에 별도 재배포 권한을 부여하는 것은 아닙니다. Gradle wrapper 스크립트의 원본 라이선스 고지는 유지했습니다.
''', encoding='utf-8')

(stage / 'build-phone.mjs').write_text("""import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('.',import.meta.url));
for(const args of [['integrations/webtoon-reader/sync-pocket.mjs'],['PhoneSDK/tools/build-mmpkg.mjs','PhoneSDK/examples/pocket-manga','dist/Pocket-Manga-2.0.5.mmpkg']]){const r=spawnSync(process.execPath,args,{cwd,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
""", encoding='utf-8')
tests = ['deck-lod', 'render-quality', 'public-proxy', 'cloudflare', 'mangadex', 'pocket-flow', 'webtoon']
test_paths = [f'work/webtoon-reader/{test}.test.mjs' for test in tests] + ['work/cartridge-library/coverflow.test.mjs','work/cartridge-library/frame-pipeline.test.mjs']
(stage / 'test-phone.mjs').write_text("import {spawnSync} from 'node:child_process';\nimport {fileURLToPath} from 'node:url';\nconst result=spawnSync(process.execPath," + json.dumps(['--test'] + test_paths) + ",{cwd:fileURLToPath(new URL('.',import.meta.url)),stdio:'inherit'});\nif(result.error)throw result.error;process.exitCode=result.status??1;\n", encoding='utf-8')

paths = sorted(p for p in stage.rglob('*') if p.is_file())
hashes = '\n'.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(stage).as_posix()}' for p in paths) + '\n'
(stage / 'SHA256SUMS.txt').write_text(hashes, encoding='utf-8')
archive = Path(str(stage) + '.zip')
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
    for path in sorted(p for p in stage.rglob('*') if p.is_file()):
        output.write(path, stage.name + '/' + path.relative_to(stage).as_posix())
with zipfile.ZipFile(archive) as check:
    assert check.testzip() is None
print(json.dumps({'stage': str(stage), 'archive': str(archive), 'files': len(paths) + 1, 'bytes': archive.stat().st_size, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}, ensure_ascii=False))

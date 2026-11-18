// K-Way HUD Navigation Module for Newtype Glass OS
import { vault } from '../../core/vault.mjs';
import { navigate, getRenderer } from '../../hub.mjs';

const W = 600;
const H = 350;

// Earth radius & Haversine distance in meters
function haversineDistMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Preset route database with real GPS coordinates (WGS84)
const ROUTES = {
  gangnam: {
    walk: [
      { turnType: 'straight', instruction: '테헤란로 14길 방면으로 직진', roadName: '테헤란로', distMeter: 120, alertText: '', subHint: '인도 안쪽으로 보행하세요', lat: 37.49808, lng: 127.02761 },
      { turnType: 'walk_right', instruction: 'GS25 편의점에서 우회전', roadName: '역삼로', distMeter: 65, alertText: '🚸 보행자 주의', subHint: '편의점 코너 진입', lat: 37.49885, lng: 127.02845 },
      { turnType: 'crosswalk', instruction: '신호등 없는 횡단보도 횡단', roadName: '골목길', distMeter: 30, alertText: '⚠️ 차량 서행 구간', subHint: '좌우 살피고 건너기', lat: 37.49925, lng: 127.02902 },
      { turnType: 'walk_left', instruction: '카페 골목에서 좌회전', roadName: '테헤란로 12길', distMeter: 85, alertText: '', subHint: '스타벅스 건물 끼고 좌회전', lat: 37.49965, lng: 127.02820 },
      { turnType: 'straight', instruction: '목적지 건물 앞까지 직진', roadName: '골목길', distMeter: 45, alertText: '', subHint: '도착지 바로 앞', lat: 37.50005, lng: 127.02801 },
      { turnType: 'arrival', instruction: '🎉 목적지 도착 완료!', roadName: '목적지', distMeter: 0, alertText: '🏁 도착 완료', subHint: '안내를 종료합니다 (수고하셨습니다)', lat: 37.50035, lng: 127.02790 }
    ],
    drive: [
      { turnType: 'straight', instruction: '강남대로 양재역 방면 직진 주행', roadName: '강남대로', distMeter: 450, alertText: '📷 과속카메라 (50km)', subHint: '1, 2차로 주행 권장', lat: 37.4979, lng: 127.0276 },
      { turnType: 'u_turn', instruction: '우성아파트 사거리 유턴 (U-Turn)', roadName: '강남대로', distMeter: 120, alertText: '↩️ 유턴 차로 진입', subHint: '좌회전/보행신호 시 유턴 가능', lat: 37.4938, lng: 127.0292 },
      { turnType: 'drive_right', instruction: '역삼세무서 골목 우회전', roadName: '역삼로', distMeter: 550, alertText: '🚸 스쿨존 시속 30km', subHint: '3차로에서 골목 진입 주의', lat: 37.4945, lng: 127.0315 },
      { turnType: 'drive_left', instruction: '역삼초교 사거리 좌회전', roadName: '역삼초교길', distMeter: 480, alertText: '', subHint: '좌회전 유도선 준수', lat: 37.4962, lng: 127.0338 },
      { turnType: 'arrival', instruction: '🎉 목적지 도착 완료!', roadName: '목적지', distMeter: 0, alertText: '🏁 도착 완료', subHint: '안내를 종료합니다', lat: 37.4975, lng: 127.0345 }
    ]
  },
  haeundae: {
    walk: [
      { turnType: 'straight', instruction: '해운대역 3번 출구 구남로 직진', roadName: '구남로 문화광장', distMeter: 250, alertText: '', subHint: '보행자 전용 거리', lat: 35.1631, lng: 129.1585 },
      { turnType: 'crosswalk', instruction: '해변 교차로 횡단보도 횡단', roadName: '해운대해변로', distMeter: 40, alertText: '🚸 보행 신호 확인', subHint: '신호등 대기', lat: 35.1605, lng: 129.1601 },
      { turnType: 'walk_left', instruction: '해수욕장 이벤트광장 방면 좌회전', roadName: '해변 산책로', distMeter: 120, alertText: '', subHint: '백사장 입구 진입', lat: 35.1592, lng: 129.1610 },
      { turnType: 'arrival', instruction: '🎉 해운대 해수욕장 도착!', roadName: '해운대 백사장', distMeter: 0, alertText: '🏁 도착 완료', subHint: '시원한 바다를 즐기세요', lat: 35.1587, lng: 129.1604 }
    ],
    drive: [
      { turnType: 'straight', instruction: '광안대교 해운대 방면 직진 횡단', roadName: '광안대교', distMeter: 4200, alertText: '🌉 광안대교 주행 중', subHint: '시속 80km 구간단속', lat: 35.1485, lng: 129.1298 },
      { turnType: 'fork_right', instruction: '벡스코 / 올림픽교차로 방면 우측 출구', roadName: '해운대로', distMeter: 1200, alertText: '', subHint: '4차로 주행 권장', lat: 35.1652, lng: 129.1384 },
      { turnType: 'drive_right', instruction: '올림픽교차로에서 해변로 우회전', roadName: '해운대해변로', distMeter: 1800, alertText: '📷 과속카메라 (50km)', subHint: '동백섬 방면 우회전', lat: 35.1598, lng: 129.1520 },
      { turnType: 'arrival', instruction: '🎉 해운대 해수욕장 입구 도착!', roadName: '목적지', distMeter: 0, alertText: '🏁 도착 완료', subHint: '공영주차장 진입', lat: 35.1587, lng: 129.1604 }
    ]
  },
  gwangalli: {
    walk: [
      { turnType: 'straight', instruction: '금련산역 1번 출구 나와 해변 방면 직진', roadName: '남천바다로', distMeter: 350, alertText: '', subHint: '바다 방면 완만한 내리막', lat: 35.1458, lng: 129.1118 },
      { turnType: 'walk_left', instruction: '광안리 해변 테마거리 좌회전', roadName: '광안해변로', distMeter: 180, alertText: '☕ 카페 거리 진입', subHint: '광안대교 뷰 산책로', lat: 35.1512, lng: 129.1185 },
      { turnType: 'arrival', instruction: '🎉 광안리 만남의광장 도착!', roadName: '광안리 해변', distMeter: 0, alertText: '🏁 도착 완료', subHint: '광안대교 야경 명소', lat: 35.1532, lng: 129.1189 }
    ],
    drive: [
      { turnType: 'straight', instruction: '수영로 남천동 방면 직진', roadName: '수영로', distMeter: 1500, alertText: '📷 신호단속 (50km)', subHint: '광안리 해변 이정표 확인', lat: 35.1472, lng: 129.1120 },
      { turnType: 'drive_left', instruction: 'KBS 삼거리에서 광안리 방면 좌회전', roadName: '광안해변로', distMeter: 800, alertText: '', subHint: '해변 순환도로 진입', lat: 35.1495, lng: 129.1165 },
      { turnType: 'arrival', instruction: '🎉 광안리 해변 도착!', roadName: '목적지', distMeter: 0, alertText: '🏁 도착 완료', subHint: '주차장 안내 준수', lat: 35.1532, lng: 129.1189 }
    ]
  },
  centum: {
    walk: [
      { turnType: 'straight', instruction: '센텀시티역 12번 출구 신세계몰 직진', roadName: '센텀남대로', distMeter: 180, alertText: '', subHint: '지하 연결통로 또는 지상 보도', lat: 35.1691, lng: 129.1302 },
      { turnType: 'walk_right', instruction: '영화의전당 방면 보행로 우회전', roadName: '센텀중앙로', distMeter: 220, alertText: '', subHint: 'KNN 타워 앞 통과', lat: 35.1705, lng: 129.1275 },
      { turnType: 'arrival', instruction: '🎉 영화의전당 빅루프 광장 도착!', roadName: '영화의전당', distMeter: 0, alertText: '🏁 도착 완료', subHint: '부산국제영화제 메인 무대', lat: 35.1712, lng: 129.1268 }
    ],
    drive: [
      { turnType: 'straight', instruction: '센텀동로 벡스코 제2전시장 방면 직진', roadName: '센텀동로', distMeter: 900, alertText: '', subHint: '수영강변 방면 2, 3차로', lat: 35.1685, lng: 129.1340 },
      { turnType: 'drive_left', instruction: '센텀북대로 영화의전당 방면 좌회전', roadName: '센텀중앙로', distMeter: 450, alertText: '📷 신호단속', subHint: '지하주차장 입구 유도선', lat: 35.1718, lng: 129.1290 },
      { turnType: 'arrival', instruction: '🎉 영화의전당 도착 완료!', roadName: '영화의전당', distMeter: 0, alertText: '🏁 차량 안내 종료', subHint: '지하주차장 진입', lat: 35.1712, lng: 129.1268 }
    ]
  }
};

export async function mount(root, scopedHub) {
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = W;
  offscreenCanvas.height = H;
  const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  const renderer = getRenderer();

  let currentRouteKey = 'gangnam';
  let currentMode = 'walk'; // 'walk' | 'drive'
  let currentStepIdx = 0;
  let remainingStepDist = 120;
  let currentSpeed = 0;
  let remainingTotalDist = 345;
  let totalStepCount = 120;
  let isSimulationRunning = false;
  let isLiveGpsRunning = false;
  let isArrived = false;
  let simInterval = null;
  let isActive = true;

  // Live GPS tracking state
  let watchId = null;
  let unbindGps = null;
  let lastGpsPos = null;

  function getActiveSteps() {
    const route = ROUTES[currentRouteKey] || ROUTES.gangnam;
    return route[currentMode] || route.walk;
  }

  function calculateTotalDist(steps, startIdx = 0) {
    let sum = 0;
    for (let i = startIdx; i < steps.length; i++) {
      sum += steps[i].distMeter || 0;
    }
    return sum;
  }

  function resetRoute(key, mode) {
    currentRouteKey = key;
    currentMode = mode;
    currentStepIdx = 0;
    const steps = getActiveSteps();
    remainingStepDist = steps[0]?.distMeter || 100;
    remainingTotalDist = calculateTotalDist(steps, 0);
    currentSpeed = 0;
    isArrived = false;
    lastGpsPos = null;
  }

  resetRoute('gangnam', 'walk');

  function drawSlimArrow(turnType, x, y, size) {
    ctx.save();
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';

    const centerX = x + size / 2;
    const centerY = y + size / 2;

    if (turnType === 'arrival' || turnType === 'destination') {
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x + 15, y + 10);
      ctx.lineTo(x + 15, y + size - 10);
      ctx.stroke();

      const flagW = size - 32;
      const flagH = Math.round((size - 25) * 0.55);
      const cols = 4;
      const rows = 3;
      const cw = flagW / cols;
      const ch = flagH / rows;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if ((r + c) % 2 === 0) {
            ctx.fillRect(x + 18 + c * cw, y + 12 + r * ch, cw, ch);
          }
        }
      }
      ctx.strokeRect(x + 18, y + 12, flagW, flagH);
    } else if (turnType.includes('right') || turnType === 'fork_right') {
      ctx.beginPath();
      ctx.moveTo(x + 15, y + size - 15);
      ctx.lineTo(x + 15, y + 42);
      ctx.arcTo(x + 15, y + 18, x + 38, y + 18, 18);
      ctx.lineTo(x + size - 28, y + 18);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + size - 4, y + 18);
      ctx.lineTo(x + size - 34, y - 6);
      ctx.lineTo(x + size - 26, y + 18);
      ctx.lineTo(x + size - 34, y + 42);
      ctx.closePath();
      ctx.fill();
    } else if (turnType.includes('left') || turnType === 'fork_left') {
      ctx.beginPath();
      ctx.moveTo(x + size - 15, y + size - 15);
      ctx.lineTo(x + size - 15, y + 42);
      ctx.arcTo(x + size - 15, y + 18, x + size - 38, y + 18, 18);
      ctx.lineTo(x + 28, y + 18);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + 4, y + 18);
      ctx.lineTo(x + 34, y - 6);
      ctx.lineTo(x + 26, y + 18);
      ctx.lineTo(x + 34, y + 42);
      ctx.closePath();
      ctx.fill();
    } else if (turnType === 'crosswalk') {
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(x + 8 + i * 22, y + 32, 14, 48);
      }
      ctx.beginPath();
      ctx.arc(centerX, y + 16, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('CROSS', x + 20, y + size - 4);
    } else if (turnType === 'u_turn') {
      ctx.beginPath();
      ctx.arc(centerX, y + 35, 26, Math.PI, 0, false);
      ctx.lineTo(centerX + 26, y + size - 15);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(centerX - 26, y + size - 15);
      ctx.lineTo(centerX - 42, y + size - 40);
      ctx.lineTo(centerX - 26, y + size - 30);
      ctx.lineTo(centerX - 10, y + size - 40);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(centerX, y + size - 12);
      ctx.lineTo(centerX, y + 36);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(centerX, y + 8);
      ctx.lineTo(centerX - 24, y + 38);
      ctx.lineTo(centerX, y + 30);
      ctx.lineTo(centerX + 24, y + 38);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function renderGlassHUD() {
    if (!isActive) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    const steps = getActiveSteps();
    const step = steps[currentStepIdx] || steps[0];
    const isDrive = currentMode === 'drive';

    // Top Header Bar
    ctx.fillStyle = isDrive ? '#38bdf8' : '#4ade80';
    ctx.font = 'bold 16px sans-serif';
    const gpsTag = isLiveGpsRunning ? ' [📡 GPS]' : (isSimulationRunning ? ' [모의안내]' : '');
    ctx.fillText(`🧭 K-Way | ${isDrive ? '차량 모드' : '도보 모드'}${gpsTag}`, 24, 34);

    const totalStr = remainingTotalDist >= 1000 ? `${(remainingTotalDist / 1000).toFixed(1)}km` : `${remainingTotalDist}m`;
    const etaMin = Math.max(1, Math.ceil(remainingTotalDist / (isDrive ? 600 : 75)));
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(isArrived ? '🏁 안내 종료' : `🏁 잔여 ${totalStr} (약 ${etaMin}분)`, W - 24, 34);
    ctx.textAlign = 'left';

    // Slim 96px Arrow
    drawSlimArrow(step.turnType, 24, 56, 96);

    // Distance in Big Bold (52px)
    const distText = isArrived ? '도착 완료!' : `${remainingStepDist}m`;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText(distText, 142, 102);

    // Turn Instruction (22px bold)
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(step.instruction, 142, 142);

    // Alert or Subhint
    if (step.alertText) {
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(step.alertText, 142, 174);
    } else if (step.subHint) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px sans-serif';
      ctx.fillText(step.subHint, 142, 174);
    }

    // Separator line
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 196);
    ctx.lineTo(W - 24, 196);
    ctx.stroke();

    // Footer Status Bar
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 16px sans-serif';
    if (!isDrive) {
      ctx.fillText(`속도: ${currentSpeed.toFixed(1)} km/h · ${totalStepCount}보`, 24, 226);
      ctx.fillStyle = '#4ade80';
      ctx.textAlign = 'right';
      ctx.fillText(isArrived ? '안전하게 도착했습니다' : `목적지: ${totalStr} 남음`, W - 24, 226);
      ctx.textAlign = 'left';
    } else {
      ctx.fillText(`속도: ${Math.round(currentSpeed)} km/h`, 24, 226);
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'right';
      ctx.fillText(isArrived ? '안전하게 도착했습니다' : `목적지: ${totalStr} 남음`, W - 24, 226);
      ctx.textAlign = 'left';
    }

    // Bottom Navigation Guide
    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('1번: 다음 단계  ·  2번: 모드 전환  ·  3번: 실시간 GPS 토글  ·  길게: 홈', W / 2, 330);
    ctx.textAlign = 'left';

    renderer.render(ctx).catch(() => {});
  }

  // --- Real-Time GPS Tracking Engine ---
  function handleGpsPosition(pos) {
    if (!isActive || isArrived) return;
    const lat = Number(pos.latitude);
    const lon = Number(pos.longitude);
    const timestamp = Number(pos.timestamp) || Date.now();
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const isDrive = currentMode === 'drive';
    const steps = getActiveSteps();
    const currentStep = steps[currentStepIdx] || steps[0];

    if (lastGpsPos) {
      const distMoved = haversineDistMeters(lastGpsPos.lat, lastGpsPos.lng, lat, lon);
      const dtSec = Math.max(0.5, (timestamp - lastGpsPos.timestamp) / 1000);
      const computedSpeed = (distMoved / dtSec) * 3.6;

      // Filter GPS jitter (< 1.2m ignored for stationary accuracy)
      if (distMoved >= 1.2) {
        currentSpeed = Math.min(isDrive ? 140 : 15, Math.max(0, computedSpeed));
        if (!isDrive) totalStepCount += Math.max(1, Math.round(distMoved / 0.7));

        // Coordinate-based waypoint check if waypoint coordinates are near
        let waypointMatched = false;
        if (currentStep && currentStep.lat && currentStep.lng) {
          const distToWaypoint = haversineDistMeters(lat, lon, currentStep.lat, currentStep.lng);
          const advanceThreshold = isDrive ? 40 : 20;

          // If within reach of the step waypoint or coordinates match route area
          if (distToWaypoint < 500) {
            remainingStepDist = Math.max(0, Math.round(distToWaypoint));
            waypointMatched = true;
            if (distToWaypoint <= advanceThreshold) {
              if (currentStepIdx < steps.length - 1) {
                currentStepIdx++;
                remainingStepDist = steps[currentStepIdx].distMeter || 50;
              } else {
                remainingStepDist = 0;
                currentSpeed = 0;
                isArrived = true;
                stopLiveGps();
              }
            }
          }
        }

        // Generic distance decrement if user is walking/driving anywhere in Korea
        if (!waypointMatched) {
          remainingStepDist = Math.max(0, remainingStepDist - Math.round(distMoved));
          remainingTotalDist = Math.max(0, remainingTotalDist - Math.round(distMoved));
          if (remainingStepDist <= 10) {
            if (currentStepIdx < steps.length - 1) {
              currentStepIdx++;
              remainingStepDist = steps[currentStepIdx].distMeter || 50;
            } else {
              remainingStepDist = 0;
              currentSpeed = 0;
              isArrived = true;
              stopLiveGps();
            }
          }
        } else {
          remainingTotalDist = calculateTotalDist(steps, currentStepIdx + 1) + remainingStepDist;
        }
      } else {
        // Stationary
        currentSpeed = 0;
      }
    } else {
      currentSpeed = 0;
    }

    lastGpsPos = { lat, lng: lon, timestamp };

    const badge = root.querySelector('#navStateBadge');
    if (badge) {
      badge.textContent = isDrive
        ? `차량 GPS (${Math.round(currentSpeed)} km/h)`
        : `도보 GPS (${currentSpeed.toFixed(1)} km/h)`;
    }

    renderGlassHUD();
  }

  function fallbackToBrowserGps() {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        const browserWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            handleGpsPosition({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: pos.timestamp || Date.now()
            });
          },
          (err) => {
            console.warn('[K-Way] Browser Geolocation error:', err);
            const badge = root.querySelector('#navStateBadge');
            if (badge) badge.textContent = 'GPS 권한 필요';
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 }
        );
        unbindGps = () => {
          navigator.geolocation.clearWatch(browserWatchId);
        };
      } catch (e) {
        console.warn('[K-Way] Browser GPS initiation failed:', e);
      }
    }
  }

  async function startLiveGps() {
    stopSimulation();
    if (isLiveGpsRunning) {
      stopLiveGps();
      return;
    }

    isLiveGpsRunning = true;
    isArrived = false;
    lastGpsPos = null;

    const btnLive = root.querySelector('#btnLiveGps');
    if (btnLive) {
      btnLive.textContent = '📡 GPS 수신 중지';
      btnLive.classList.add('active');
    }
    const badge = root.querySelector('#navStateBadge');
    if (badge) badge.textContent = '📡 GPS 신호 탐색 중...';

    // 1. PhoneSDK Bridge location (공식 MemoMind 명세: watchPosition 호출 전 리스너 사전 등록)
    if (scopedHub.location?.onPosition) {
      const unsubPos = scopedHub.location.onPosition((pos) => {
        handleGpsPosition(pos);
      });
      const unsubErr = scopedHub.location.onError?.((err) => {
        console.warn('[K-Way] PhoneSDK location error, falling back:', err);
        fallbackToBrowserGps();
      });
      unbindGps = () => {
        unsubPos?.();
        unsubErr?.();
      };

      try {
        const res = await scopedHub.location.watchPosition({ timeoutMs: 15000 });
        watchId = res?.watchId || null;
      } catch (err) {
        console.warn('[K-Way] PhoneSDK watchPosition failed:', err);
        fallbackToBrowserGps();
      }
    } else {
      fallbackToBrowserGps();
    }

    renderGlassHUD();
  }

  function stopLiveGps() {
    if (watchId && scopedHub.location?.clearWatch) {
      scopedHub.location.clearWatch(watchId).catch(() => {});
      watchId = null;
    }
    if (unbindGps) {
      unbindGps();
      unbindGps = null;
    }
    isLiveGpsRunning = false;
    lastGpsPos = null;

    const btnLive = root.querySelector('#btnLiveGps');
    if (btnLive) {
      btnLive.textContent = '📡 스마트폰 실시간 GPS';
      btnLive.classList.remove('active');
    }
    const badge = root.querySelector('#navStateBadge');
    if (badge && !isSimulationRunning) badge.textContent = '대기 중';
    renderGlassHUD();
  }

  function stopSimulation() {
    if (simInterval) {
      clearInterval(simInterval);
      simInterval = null;
    }
    isSimulationRunning = false;
    const btnSim = root.querySelector('#btnToggleSim');
    if (btnSim) btnSim.textContent = currentMode === 'drive' ? '🚗 차량 모의 주행 시작' : '🚶 도보 모의 산책 시작';
    const badge = root.querySelector('#navStateBadge');
    if (badge && !isLiveGpsRunning) badge.textContent = '대기 중';
  }

  function startSimulation() {
    stopLiveGps();
    if (simInterval) {
      stopSimulation();
      return;
    }
    isSimulationRunning = true;
    isArrived = false;
    const isDrive = currentMode === 'drive';
    const btnSim = root.querySelector('#btnToggleSim');
    if (btnSim) btnSim.textContent = '⏸️ 모의 안내 일시정지';
    const badge = root.querySelector('#navStateBadge');
    if (badge) badge.textContent = isDrive ? '차량 모의 주행 중' : '도보 모의 산책 중';

    simInterval = setInterval(() => {
      if (!isActive || isArrived) {
        stopSimulation();
        return;
      }

      const steps = getActiveSteps();
      const delta = isDrive ? 25 : 8;
      currentSpeed = isDrive ? 42 + Math.random() * 8 : 3.8 + Math.random() * 0.6;
      if (!isDrive) totalStepCount += 10;
      remainingStepDist -= delta;
      remainingTotalDist = Math.max(0, remainingTotalDist - delta);

      if (remainingStepDist <= 0) {
        if (currentStepIdx < steps.length - 1) {
          currentStepIdx++;
          remainingStepDist = steps[currentStepIdx].distMeter;
        } else {
          remainingStepDist = 0;
          currentSpeed = 0;
          isArrived = true;
          stopSimulation();
        }
      }
      renderGlassHUD();
    }, 800);
  }

  // --- Button Listeners ---
  scopedHub.device.onButton((e) => {
    const act = String(e.action || '').toLowerCase();
    const isSingle = act === 'click' || act === 'single' || act === 'singleclick' || act === 'one';
    const isDouble = act === 'double' || act === 'doubleclick' || act === 'two';
    const isTriple = act === 'triple' || act === 'tripleclick' || act === 'three';

    const steps = getActiveSteps();

    if (isSingle) {
      // Manual Next Step Advance
      if (currentStepIdx < steps.length - 1) {
        currentStepIdx++;
        remainingStepDist = steps[currentStepIdx].distMeter;
      } else {
        remainingStepDist = 0;
        currentSpeed = 0;
        isArrived = true;
        stopSimulation();
        stopLiveGps();
      }
      renderGlassHUD();
    } else if (isDouble) {
      // Mode switch
      currentMode = currentMode === 'walk' ? 'drive' : 'walk';
      resetRoute(currentRouteKey, currentMode);
      const btnSim = root.querySelector('#btnToggleSim');
      if (btnSim && !isSimulationRunning) {
        btnSim.textContent = currentMode === 'drive' ? '🚗 차량 모의 주행 시작' : '🚶 도보 모의 산책 시작';
      }
      const btnWalk = root.querySelector('#btnModeWalk');
      const btnDrive = root.querySelector('#btnModeDrive');
      if (btnWalk && btnDrive) {
        btnWalk.classList.toggle('active', currentMode === 'walk');
        btnDrive.classList.toggle('active', currentMode === 'drive');
      }
      renderGlassHUD();
    } else if (isTriple) {
      // 3-Click: Toggle or Re-sync Real GPS
      if (isLiveGpsRunning) {
        stopLiveGps();
      } else {
        startLiveGps();
      }
    }
  });

  // --- UI Event bindings ---
  root.querySelector('[data-action="home"]')?.addEventListener('click', () => {
    stopSimulation();
    stopLiveGps();
    isActive = false;
    navigate('home');
  });

  root.querySelector('#btnModeWalk')?.addEventListener('click', () => {
    if (currentMode === 'walk') return;
    currentMode = 'walk';
    resetRoute(currentRouteKey, 'walk');
    root.querySelector('#btnModeWalk')?.classList.add('active');
    root.querySelector('#btnModeDrive')?.classList.remove('active');
    const btnSim = root.querySelector('#btnToggleSim');
    if (btnSim && !isSimulationRunning) btnSim.textContent = '🚶 도보 모의 산책 시작';
    renderGlassHUD();
  });

  root.querySelector('#btnModeDrive')?.addEventListener('click', () => {
    if (currentMode === 'drive') return;
    currentMode = 'drive';
    resetRoute(currentRouteKey, 'drive');
    root.querySelector('#btnModeDrive')?.classList.add('active');
    root.querySelector('#btnModeWalk')?.classList.remove('active');
    const btnSim = root.querySelector('#btnToggleSim');
    if (btnSim && !isSimulationRunning) btnSim.textContent = '🚗 차량 모의 주행 시작';
    renderGlassHUD();
  });

  root.querySelector('#btnToggleSim')?.addEventListener('click', () => startSimulation());
  root.querySelector('#btnLiveGps')?.addEventListener('click', () => startLiveGps());

  // Quick route chips
  const quickKeys = ['haeundae', 'gwangalli', 'centum'];
  root.querySelectorAll('.quick-routes .chip').forEach((chip, idx) => {
    chip.addEventListener('click', () => {
      const targetKey = quickKeys[idx] || 'haeundae';
      stopSimulation();
      stopLiveGps();
      resetRoute(targetKey, currentMode);
      renderGlassHUD();
    });
  });

  // Search input
  root.querySelector('#btnSearchRoute')?.addEventListener('click', () => {
    const input = root.querySelector('#routeQueryInput');
    const query = (input?.value || '').trim();
    if (!query) return;

    stopSimulation();
    stopLiveGps();

    if (query.includes('광안')) {
      resetRoute('gwangalli', currentMode);
    } else if (query.includes('센텀') || query.includes('영화')) {
      resetRoute('centum', currentMode);
    } else if (query.includes('해운대') || query.includes('부산')) {
      resetRoute('haeundae', currentMode);
    } else {
      resetRoute('gangnam', currentMode);
    }
    renderGlassHUD();
  });

  scopedHub.on('runtime.lifecycleChanged', (e) => {
    if (e.state === 'suspended' || e.state === 'stopped' || e.state === 'closed') {
      stopSimulation();
      stopLiveGps();
      isActive = false;
    } else if (e.state === 'running') {
      isActive = true;
      renderGlassHUD();
    }
  });

  renderGlassHUD();
}

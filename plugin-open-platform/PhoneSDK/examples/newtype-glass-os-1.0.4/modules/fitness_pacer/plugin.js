// Fitness Pacer Module for Newtype Glass OS - Real-Time GPS & Pace Tracking
import { vault } from '../../core/vault.mjs';
import { navigate, getRenderer } from '../../hub.mjs';

const W = 600;
const H = 350;

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

function formatPace(sec) {
  if (!sec || !Number.isFinite(sec) || sec <= 0 || sec > 3600) return "--'--\"";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}'${s < 10 ? '0' : ''}${s}"`;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

export async function mount(root, scopedHub) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const renderer = getRenderer();

  let currentMode = 'run'; // 'run' | 'walk'
  let isWorkoutRunning = false;
  let isLiveGpsRunning = false;
  let elapsedSec = 0;
  let totalDistMeters = 0;
  let currentSpeedKmh = 0;
  let currentPaceSec = 0;
  let cadence = 0;
  let calories = 0;
  let heartRate = 142;
  let timerInterval = null;
  let isActive = true;

  // GPS state
  let watchId = null;
  let unbindGps = null;
  let lastGpsPos = null;

  function getTargetPaceSec() {
    return currentMode === 'run' ? 330 : 720; // 5'30" vs 12'00"
  }

  function updateMobileMetrics() {
    const elPace = root.querySelector('#metricPace');
    const elDist = root.querySelector('#metricDist');
    const elTime = root.querySelector('#metricTime');
    const elSpeed = root.querySelector('#metricSpeed');
    const elCal = root.querySelector('#metricCal');
    const elCad = root.querySelector('#metricCadence');
    const elBadge = root.querySelector('#fitnessStateBadge');

    if (elPace) elPace.textContent = formatPace(currentPaceSec);
    if (elDist) elDist.textContent = `${(totalDistMeters / 1000).toFixed(2)} km`;
    if (elTime) elTime.textContent = formatTime(elapsedSec);
    if (elSpeed) elSpeed.textContent = `${currentSpeedKmh.toFixed(1)} km/h`;
    if (elCal) elCal.textContent = `${calories} kcal`;
    if (elCad) elCad.textContent = `${cadence} spm`;

    if (elBadge) {
      if (isLiveGpsRunning) {
        elBadge.textContent = `📡 실시간 GPS (${currentSpeedKmh.toFixed(1)} km/h)`;
        elBadge.className = 'nav-state-badge active';
      } else if (isWorkoutRunning) {
        elBadge.textContent = '운동 진행 중';
        elBadge.className = 'nav-state-badge active';
      } else {
        elBadge.textContent = '대기 중';
        elBadge.className = 'nav-state-badge';
      }
    }
  }

  function renderGlassHUD() {
    if (!isActive) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    const isRun = currentMode === 'run';
    const gpsTag = isLiveGpsRunning ? ' [📡 GPS]' : (isWorkoutRunning ? ' [모의]' : ' [정지]');

    // 1. Top Header Bar
    ctx.fillStyle = isRun ? '#4ade80' : '#38bdf8';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`🏃 Fitness Pacer | ${isRun ? '러닝' : '산책'}${gpsTag}`, 24, 34);

    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`⏱️ ${formatTime(elapsedSec)}`, W - 24, 34);
    ctx.textAlign = 'left';

    // 2. Pace Display (Big Bold 56px)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px sans-serif';
    const paceStr = currentPaceSec > 0 ? formatPace(currentPaceSec) : "--'--\"";
    ctx.fillText(paceStr, 24, 110);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    const avgPace = totalDistMeters > 50 ? Math.round(elapsedSec / (totalDistMeters / 1000)) : 0;
    const targetStr = formatPace(getTargetPaceSec());
    ctx.fillText(`현재 페이스 (/km) · 목표: ${targetStr} · 평균: ${formatPace(avgPace)}`, 24, 142);

    // 3. Heart Rate Card (Right side)
    ctx.fillStyle = '#f43f5e';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${heartRate} BPM`, W - 24, 110);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '15px sans-serif';
    ctx.fillText('심박수 (유산소존)', W - 24, 142);
    ctx.textAlign = 'left';

    // 4. Stats Summary Bar (22px bold)
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 19px sans-serif';
    const distStr = `${(totalDistMeters / 1000).toFixed(2)} km`;
    ctx.fillText(`거리: ${distStr}   칼로리: ${calories} kcal   케이던스: ${cadence} spm`, 24, 190);

    // 5. Separator
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 218);
    ctx.lineTo(W - 24, 218);
    ctx.stroke();

    // 6. Coach Advice
    ctx.fillStyle = currentPaceSec > 0 && currentPaceSec <= getTargetPaceSec() ? '#4ade80' : '#facc15';
    ctx.font = 'bold 15px sans-serif';
    const coachMsg = currentPaceSec === 0
      ? '준비 운동 후 러닝을 시작하세요'
      : (currentPaceSec <= getTargetPaceSec() ? '🔥 완벽한 목표 페이스 유지 중!' : '⚡ 목표 페이스를 위해 피치를 조금 올려보세요');
    ctx.fillText(`코치: ${coachMsg}`, 24, 248);

    // 7. Footer
    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('1번: 운동 일시정지/재개  ·  2번: 러닝/산책 전환  ·  3번: 실시간 GPS 토글  ·  길게: 홈', W / 2, 330);
    ctx.textAlign = 'left';

    renderer.render(ctx).catch(() => {});
  }

  // --- Real-Time GPS Tracking Engine ---
  function handleGpsPosition(pos) {
    if (!isActive) return;
    const lat = Number(pos.latitude);
    const lon = Number(pos.longitude);
    const timestamp = Number(pos.timestamp) || Date.now();
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    if (lastGpsPos) {
      const distMoved = haversineDistMeters(lastGpsPos.lat, lastGpsPos.lng, lat, lon);
      const dtSec = Math.max(0.5, (timestamp - lastGpsPos.timestamp) / 1000);
      const computedSpeed = (distMoved / dtSec) * 3.6;

      if (distMoved >= 1.2) {
        currentSpeedKmh = Math.min(35, Math.max(0, computedSpeed));
        totalDistMeters += distMoved;
        calories = Math.floor((totalDistMeters / 1000) * 65);
        cadence = Math.min(210, Math.max(120, Math.round(140 + currentSpeedKmh * 3.5)));
        if (currentSpeedKmh >= 1.5) {
          currentPaceSec = Math.round(3600 / currentSpeedKmh);
        } else {
          currentPaceSec = 0;
        }
        heartRate = Math.min(185, Math.max(110, Math.round(120 + currentSpeedKmh * 4.2)));
      } else {
        currentSpeedKmh = 0;
        currentPaceSec = 0;
      }
    } else {
      currentSpeedKmh = 0;
      currentPaceSec = 0;
    }

    lastGpsPos = { lat, lng: lon, timestamp };
    updateMobileMetrics();
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
            console.warn('[Fitness] Browser GPS error:', err);
            const badge = root.querySelector('#fitnessStateBadge');
            if (badge) badge.textContent = 'GPS 권한 필요';
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 }
        );
        unbindGps = () => {
          navigator.geolocation.clearWatch(browserWatchId);
        };
      } catch (e) {
        console.warn('[Fitness] Browser GPS initiation failed:', e);
      }
    }
  }

  async function startLiveGps() {
    if (isLiveGpsRunning) {
      stopLiveGps();
      return;
    }
    isLiveGpsRunning = true;
    lastGpsPos = null;

    if (!isWorkoutRunning) {
      startWorkoutTimer();
    }

    const btnLive = root.querySelector('#btnLiveGps');
    if (btnLive) {
      btnLive.textContent = '📡 GPS 수신 중지';
      btnLive.classList.add('active');
    }
    updateMobileMetrics();

    // PhoneSDK Bridge location
    if (scopedHub.location?.onPosition) {
      const unsubPos = scopedHub.location.onPosition((pos) => {
        handleGpsPosition(pos);
      });
      const unsubErr = scopedHub.location.onError?.((err) => {
        console.warn('[Fitness] PhoneSDK location error, fallback:', err);
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
        console.warn('[Fitness] watchPosition failed:', err);
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
    updateMobileMetrics();
    renderGlassHUD();
  }

  function startWorkoutTimer() {
    if (timerInterval) return;
    isWorkoutRunning = true;
    const btnToggle = root.querySelector('#btnToggleWorkout');
    if (btnToggle) btnToggle.textContent = '⏸️ 운동 일시정지';

    timerInterval = setInterval(() => {
      if (!isActive) return;
      elapsedSec++;

      // In simulation mode (when real GPS is not toggled), advance distance smoothly
      if (!isLiveGpsRunning) {
        const isRun = currentMode === 'run';
        const deltaMeters = isRun ? 2.8 + Math.random() * 0.4 : 1.3 + Math.random() * 0.2;
        totalDistMeters += deltaMeters;
        currentSpeedKmh = isRun ? 10.4 + (Math.random() * 0.6 - 0.3) : 4.8 + (Math.random() * 0.4 - 0.2);
        currentPaceSec = Math.round(3600 / currentSpeedKmh);
        calories = Math.floor((totalDistMeters / 1000) * 65);
        cadence = isRun ? 168 + Math.floor(Math.random() * 6) : 110 + Math.floor(Math.random() * 4);
        heartRate = isRun ? 148 + Math.floor(Math.random() * 6) : 105 + Math.floor(Math.random() * 4);
      }

      updateMobileMetrics();
      renderGlassHUD();
    }, 1000);
  }

  function stopWorkoutTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    isWorkoutRunning = false;
    const btnToggle = root.querySelector('#btnToggleWorkout');
    if (btnToggle) btnToggle.textContent = '🏃 러닝 운동 시작';
    updateMobileMetrics();
    renderGlassHUD();
  }

  function toggleWorkout() {
    if (isWorkoutRunning) {
      stopWorkoutTimer();
      stopLiveGps();
    } else {
      startWorkoutTimer();
    }
  }

  // --- Button Listeners ---
  scopedHub.device.onButton((e) => {
    const act = String(e.action || '').toLowerCase();
    const isSingle = act === 'click' || act === 'single' || act === 'singleclick' || act === 'one';
    const isDouble = act === 'double' || act === 'doubleclick' || act === 'two';
    const isTriple = act === 'triple' || act === 'tripleclick' || act === 'three';

    if (isSingle) {
      toggleWorkout();
    } else if (isDouble) {
      currentMode = currentMode === 'run' ? 'walk' : 'run';
      root.querySelector('#btnModeRun')?.classList.toggle('active', currentMode === 'run');
      root.querySelector('#btnModeWalk')?.classList.toggle('active', currentMode === 'walk');
      renderGlassHUD();
    } else if (isTriple) {
      startLiveGps();
    }
  });

  // --- UI Event bindings ---
  root.querySelector('[data-action="home"]')?.addEventListener('click', () => {
    stopWorkoutTimer();
    stopLiveGps();
    isActive = false;
    navigate('home');
  });

  root.querySelector('#btnToggleWorkout')?.addEventListener('click', toggleWorkout);
  root.querySelector('#btnLiveGps')?.addEventListener('click', startLiveGps);

  root.querySelector('#btnModeRun')?.addEventListener('click', () => {
    currentMode = 'run';
    root.querySelector('#btnModeRun')?.classList.add('active');
    root.querySelector('#btnModeWalk')?.classList.remove('active');
    renderGlassHUD();
  });

  root.querySelector('#btnModeWalk')?.addEventListener('click', () => {
    currentMode = 'walk';
    root.querySelector('#btnModeWalk')?.classList.add('active');
    root.querySelector('#btnModeRun')?.classList.remove('active');
    renderGlassHUD();
  });

  scopedHub.on('runtime.lifecycleChanged', (e) => {
    if (e.state === 'suspended' || e.state === 'stopped' || e.state === 'closed') {
      stopWorkoutTimer();
      stopLiveGps();
      isActive = false;
    } else if (e.state === 'running') {
      isActive = true;
      renderGlassHUD();
    }
  });

  updateMobileMetrics();
  renderGlassHUD();
}

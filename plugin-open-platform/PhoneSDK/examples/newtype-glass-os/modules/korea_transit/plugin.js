// Korea Transit Module for Newtype Glass OS - Unified Subway & Bus HUD
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

// 전국 대중교통 거점 데이터베이스 (지하철 + 버스 통합)
const STATIONS = {
  gangnam: {
    name: '강남역 사거리 (서울)',
    shortName: '서울 강남역',
    lat: 37.4979,
    lng: 127.0276,
    items: [
      // 🚇 지하철 노선
      {
        id: 'g_sub2_out',
        type: 'METRO',
        category: '지하철',
        routeNo: '2호선 강남역',
        badgeClass: 'sub-line2',
        badgeColor: '#059669',
        dest: '외선순환 (선릉·잠실·성수 방면)',
        remainSec: 110,
        stopsLeft: 1,
        crowded: '혼잡',
        currentLoc: '교대역 출발',
        nextArrival: '다음 열차 4분 후'
      },
      {
        id: 'g_sub_sin',
        type: 'METRO',
        category: '지하철',
        routeNo: '신분당선 강남역',
        badgeClass: 'sub-line2',
        badgeColor: '#dc2626',
        dest: '신사 ↔ 판교·광교 방면',
        remainSec: 280,
        stopsLeft: 2,
        crowded: '보통',
        currentLoc: '양재역 진입',
        nextArrival: '다음 열차 7분 후'
      },
      {
        id: 'g_sub2_in',
        type: 'METRO',
        category: '지하철',
        routeNo: '2호선 강남역',
        badgeClass: 'sub-line2',
        badgeColor: '#059669',
        dest: '내선순환 (사당·신도림·홍대 방면)',
        remainSec: 350,
        stopsLeft: 3,
        crowded: '보통',
        currentLoc: '역삼역 통과',
        nextArrival: '다음 열차 6분 후'
      },
      // 🚌 버스 노선
      {
        id: 'g_bus146',
        type: 'BUS',
        category: '간선버스',
        routeNo: '간선 146',
        badgeClass: 'bus-blue',
        badgeColor: '#1d4ed8',
        dest: '상계동 ↔ 강남역 ↔ 교대역',
        remainSec: 175,
        stopsLeft: 2,
        crowded: '보통',
        currentLoc: '역삼역 포스코타워 앞',
        nextArrival: '다음 버스 11분 후'
      },
      {
        id: 'g_bus3412',
        type: 'BUS',
        category: '지선버스',
        routeNo: '지선 3412',
        badgeClass: 'bus-green',
        badgeColor: '#16a34a',
        dest: '우면동 ↔ 강남역 ↔ 강동공영차고지',
        remainSec: 410,
        stopsLeft: 5,
        crowded: '여유',
        currentLoc: '교대역 사거리',
        nextArrival: '다음 버스 14분 후'
      },
      {
        id: 'g_bus9401',
        type: 'BUS',
        category: '광역버스',
        routeNo: '광역 9401',
        badgeClass: 'bus-blue',
        badgeColor: '#dc2626',
        dest: '분당구미동 ↔ 강남역 ↔ 서울역',
        remainSec: 190,
        stopsLeft: 2,
        crowded: '보통',
        currentLoc: '신논현역 진입',
        nextArrival: '다음 버스 8분 후'
      }
    ]
  },

  seomyeon: {
    name: '서면역 7번 출구 (부산)',
    shortName: '부산 서면역',
    lat: 35.1578,
    lng: 129.0594,
    items: [
      // 🚇 지하철 노선
      {
        id: 's_sub1',
        type: 'METRO',
        category: '도시철도',
        routeNo: '부산 1호선 서면역',
        badgeClass: 'sub-line2',
        badgeColor: '#ea580c',
        dest: '노포행 (동래·부산대 방면)',
        remainSec: 130,
        stopsLeft: 1,
        crowded: '보통',
        currentLoc: '범내골역 진입',
        nextArrival: '다음 열차 5분 후'
      },
      {
        id: 's_sub2',
        type: 'METRO',
        category: '도시철도',
        routeNo: '부산 2호선 서면역',
        badgeClass: 'sub-line2',
        badgeColor: '#65a30d',
        dest: '장산행 (센텀·해운대 방면)',
        remainSec: 240,
        stopsLeft: 2,
        crowded: '혼잡',
        currentLoc: '부암역 통과',
        nextArrival: '다음 열차 6분 후'
      },
      {
        id: 's_sub1_da',
        type: 'METRO',
        category: '도시철도',
        routeNo: '부산 1호선 서면역',
        badgeClass: 'sub-line2',
        badgeColor: '#ea580c',
        dest: '다대포행 (부산역·남포 방면)',
        remainSec: 360,
        stopsLeft: 3,
        crowded: '여유',
        currentLoc: '부전역 출발',
        nextArrival: '다음 열차 7분 후'
      },
      // 🚌 버스 노선
      {
        id: 's_bus1001',
        type: 'BUS',
        category: '급행버스',
        routeNo: '급행 1001',
        badgeClass: 'bus-blue',
        badgeColor: '#dc2626',
        dest: '청강리 ↔ 서면 ↔ 하단역',
        remainSec: 160,
        stopsLeft: 2,
        crowded: '여유',
        currentLoc: '부전시장 통과',
        nextArrival: '다음 버스 12분 후'
      },
      {
        id: 's_bus83',
        type: 'BUS',
        category: '일반버스',
        routeNo: '일반 83-1',
        badgeClass: 'bus-green',
        badgeColor: '#0284c7',
        dest: '민락동 ↔ 서면 ↔ 사직동',
        remainSec: 280,
        stopsLeft: 3,
        crowded: '보통',
        currentLoc: '전포사거리 앞',
        nextArrival: '다음 버스 10분 후'
      },
      {
        id: 's_bus108',
        type: 'BUS',
        category: '일반버스',
        routeNo: '일반 108',
        badgeClass: 'bus-green',
        badgeColor: '#0284c7',
        dest: '엄궁동 ↔ 서면 ↔ 민락동',
        remainSec: 490,
        stopsLeft: 5,
        crowded: '보통',
        currentLoc: '가야역 사거리',
        nextArrival: '다음 버스 15분 후'
      },
      {
        id: 's_bus138',
        type: 'BUS',
        category: '일반버스',
        routeNo: '일반 138',
        badgeClass: 'bus-green',
        badgeColor: '#0284c7',
        dest: '신평 ↔ 서면 ↔ 문현동',
        remainSec: 840,
        stopsLeft: 8,
        crowded: '혼잡',
        currentLoc: '주례역 앞',
        nextArrival: '다음 버스 20분 후'
      }
    ]
  },

  centum: {
    name: '센텀시티역.벡스코 (부산)',
    shortName: '부산 센텀시티',
    lat: 35.1691,
    lng: 129.1317,
    items: [
      // 🚇 지하철
      {
        id: 'c_sub2',
        type: 'METRO',
        category: '도시철도',
        routeNo: '부산 2호선 센텀시티',
        badgeClass: 'sub-line2',
        badgeColor: '#65a30d',
        dest: '양산행 (광안·서면 방면)',
        remainSec: 170,
        stopsLeft: 1,
        crowded: '여유',
        currentLoc: '민락역 통과',
        nextArrival: '다음 열차 5분 후'
      },
      {
        id: 'c_sub2_jang',
        type: 'METRO',
        category: '도시철도',
        routeNo: '부산 2호선 센텀시티',
        badgeClass: 'sub-line2',
        badgeColor: '#65a30d',
        dest: '장산행 (벡스코·해운대 방면)',
        remainSec: 290,
        stopsLeft: 2,
        crowded: '보통',
        currentLoc: '수영역 출발',
        nextArrival: '다음 열차 6분 후'
      },
      // 🚌 버스
      {
        id: 'c_bus307',
        type: 'BUS',
        category: '일반버스',
        routeNo: '일반 307',
        badgeClass: 'bus-green',
        badgeColor: '#0284c7',
        dest: '김해공항 ↔ 동래 ↔ 해운대',
        remainSec: 190,
        stopsLeft: 2,
        crowded: '여유',
        currentLoc: '센텀고등학교 앞',
        nextArrival: '다음 버스 14분 후'
      },
      {
        id: 'c_bus1002',
        type: 'BUS',
        category: '급행버스',
        routeNo: '급행 1002',
        badgeClass: 'bus-blue',
        badgeColor: '#dc2626',
        dest: '양산 ↔ 센텀시티역',
        remainSec: 350,
        stopsLeft: 4,
        crowded: '보통',
        currentLoc: '재송역 사거리',
        nextArrival: '다음 버스 16분 후'
      },
      {
        id: 'c_bus115',
        type: 'BUS',
        category: '일반버스',
        routeNo: '일반 115-1',
        badgeClass: 'bus-green',
        badgeColor: '#0284c7',
        dest: '반송 ↔ 벡스코 ↔ 해운대구청',
        remainSec: 540,
        stopsLeft: 6,
        crowded: '여유',
        currentLoc: '수영강변대로',
        nextArrival: '다음 버스 17분 후'
      }
    ]
  },

  haeundae: {
    name: '해운대역 광장 (부산)',
    shortName: '부산 해운대역',
    lat: 35.1631,
    lng: 129.1585,
    items: [
      // 🚇 지하철
      {
        id: 'h_sub2',
        type: 'METRO',
        category: '도시철도',
        routeNo: '부산 2호선 해운대역',
        badgeClass: 'sub-line2',
        badgeColor: '#65a30d',
        dest: '양산행 (센텀·서면 방면)',
        remainSec: 150,
        stopsLeft: 1,
        crowded: '여유',
        currentLoc: '중동역 통과',
        nextArrival: '다음 열차 5분 후'
      },
      {
        id: 'h_sub2_end',
        type: 'METRO',
        category: '도시철도',
        routeNo: '부산 2호선 해운대역',
        badgeClass: 'sub-line2',
        badgeColor: '#65a30d',
        dest: '장산 종착 방면',
        remainSec: 310,
        stopsLeft: 2,
        crowded: '원활',
        currentLoc: '동백역 출발',
        nextArrival: '다음 열차 6분 후'
      },
      // 🚌 버스
      {
        id: 'h_bus1001',
        type: 'BUS',
        category: '급행버스',
        routeNo: '급행 1001',
        badgeClass: 'bus-blue',
        badgeColor: '#dc2626',
        dest: '청강리 ↔ 해운대 ↔ 부산역',
        remainSec: 220,
        stopsLeft: 3,
        crowded: '보통',
        currentLoc: '송정입구',
        nextArrival: '다음 버스 13분 후'
      },
      {
        id: 'h_bus1003',
        type: 'BUS',
        category: '급행버스',
        routeNo: '급행 1003',
        badgeClass: 'bus-blue',
        badgeColor: '#dc2626',
        dest: '기장 ↔ 해운대 ↔ 부산역',
        remainSec: 380,
        stopsLeft: 5,
        crowded: '혼잡',
        currentLoc: '해운대백병원 앞',
        nextArrival: '다음 버스 15분 후'
      },
      {
        id: 'h_bus39',
        type: 'BUS',
        category: '일반버스',
        routeNo: '일반 39',
        badgeClass: 'bus-green',
        badgeColor: '#0284c7',
        dest: '기장교리 ↔ 해운대 ↔ 동래역',
        remainSec: 460,
        stopsLeft: 6,
        crowded: '여유',
        currentLoc: '미포문탠로드 입구',
        nextArrival: '다음 버스 18분 후'
      }
    ]
  },

  bs_station: {
    name: '부산역 광장 (초량)',
    shortName: '부산역 광장',
    lat: 35.1152,
    lng: 129.0422,
    items: [
      // 🚇 지하철
      {
        id: 'b_sub1',
        type: 'METRO',
        category: '도시철도',
        routeNo: '부산 1호선 부산역',
        badgeClass: 'sub-line2',
        badgeColor: '#ea580c',
        dest: '노포행 (서면·동래 방면)',
        remainSec: 140,
        stopsLeft: 1,
        crowded: '보통',
        currentLoc: '초량역 통과',
        nextArrival: '다음 열차 4분 후'
      },
      {
        id: 'b_sub1_da',
        type: 'METRO',
        category: '도시철도',
        routeNo: '부산 1호선 부산역',
        badgeClass: 'sub-line2',
        badgeColor: '#ea580c',
        dest: '다대포행 (남포·하단 방면)',
        remainSec: 270,
        stopsLeft: 2,
        crowded: '여유',
        currentLoc: '중앙역 출발',
        nextArrival: '다음 열차 5분 후'
      },
      // 🚌 버스
      {
        id: 'b_bus1000',
        type: 'BUS',
        category: '급행버스',
        routeNo: '급행 1000',
        badgeClass: 'bus-blue',
        badgeColor: '#dc2626',
        dest: '다대포 ↔ 서면 ↔ 부산역',
        remainSec: 120,
        stopsLeft: 1,
        crowded: '여유',
        currentLoc: '부산진역 통과',
        nextArrival: '다음 버스 10분 후'
      },
      {
        id: 'b_bus27',
        type: 'BUS',
        category: '일반버스',
        routeNo: '일반 27',
        badgeClass: 'bus-green',
        badgeColor: '#0284c7',
        dest: '용호동 ↔ 부산역 ↔ 충무동',
        remainSec: 310,
        stopsLeft: 3,
        crowded: '보통',
        currentLoc: '영주고가도로 입구',
        nextArrival: '다음 버스 12분 후'
      },
      {
        id: 'b_bus41',
        type: 'BUS',
        category: '일반버스',
        routeNo: '일반 41',
        badgeClass: 'bus-green',
        badgeColor: '#0284c7',
        dest: '민락동 ↔ 부산역 ↔ 구덕운동장',
        remainSec: 600,
        stopsLeft: 7,
        crowded: '여유',
        currentLoc: '문현동 사거리',
        nextArrival: '다음 버스 16분 후'
      }
    ]
  },

  pangyo: {
    name: '판교역 알파돔시티 (성남)',
    shortName: '경기 판교역',
    lat: 37.3948,
    lng: 127.1119,
    items: [
      // 🚇 지하철
      {
        id: 'p_sub_sin',
        type: 'METRO',
        category: '지하철',
        routeNo: '신분당선 판교역',
        badgeClass: 'sub-line2',
        badgeColor: '#dc2626',
        dest: '신사행 (양재·강남 방면)',
        remainSec: 140,
        stopsLeft: 1,
        crowded: '혼잡',
        currentLoc: '정자역 출발',
        nextArrival: '다음 열차 5분 후'
      },
      {
        id: 'p_sub_gg',
        type: 'METRO',
        category: '지하철',
        routeNo: '경강선 판교역',
        badgeClass: 'sub-line2',
        badgeColor: '#0284c7',
        dest: '여주행 (이매·경기광주 방면)',
        remainSec: 420,
        stopsLeft: 3,
        crowded: '여유',
        currentLoc: '판교 차량기지 대기',
        nextArrival: '다음 열차 15분 후'
      },
      // 🚌 버스
      {
        id: 'p_bus9007',
        type: 'BUS',
        category: '광역버스',
        routeNo: '광역 9007',
        badgeClass: 'bus-blue',
        badgeColor: '#dc2626',
        dest: '판교테크노밸리 ↔ 서울역',
        remainSec: 210,
        stopsLeft: 2,
        crowded: '보통',
        currentLoc: 'H스퀘어 앞',
        nextArrival: '다음 버스 11분 후'
      },
      {
        id: 'p_bus390',
        type: 'BUS',
        category: '일반버스',
        routeNo: '일반 390',
        badgeClass: 'bus-green',
        badgeColor: '#16a34a',
        dest: '야탑역 ↔ 판교역 ↔ 사송동',
        remainSec: 350,
        stopsLeft: 4,
        crowded: '여유',
        currentLoc: '백현마을 4단지',
        nextArrival: '다음 버스 14분 후'
      }
    ]
  }
};

export async function mount(root, scopedHub) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const renderer = getRenderer();

  let currentStationKey = 'gangnam';
  let filterMode = 'METRO'; // 'METRO' | 'BUS' | 'ALL'
  let lineIdx = 0;
  let isActive = true;
  let countdownTimer = null;

  function getActiveStation() {
    return STATIONS[currentStationKey] || STATIONS.gangnam;
  }

  function getFilteredItems() {
    const all = getActiveStation().items;
    if (filterMode === 'METRO') {
      return all.filter((it) => it.type === 'METRO');
    }
    if (filterMode === 'BUS') {
      return all.filter((it) => it.type === 'BUS');
    }
    return all;
  }

  function formatTime(totalSec) {
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min <= 0) return `${sec}초 후`;
    return `${min}분 ${sec.toString().padStart(2, '0')}초 후`;
  }

  function formatDigital(totalSec) {
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  function updateCounts() {
    const st = getActiveStation();
    const metroCount = st.items.filter((it) => it.type === 'METRO').length;
    const busCount = st.items.filter((it) => it.type === 'BUS').length;
    const allCount = st.items.length;

    const elM = root.querySelector('#countMetro');
    const elB = root.querySelector('#countBus');
    const elA = root.querySelector('#countAll');
    if (elM) elM.textContent = metroCount;
    if (elB) elB.textContent = busCount;
    if (elA) elA.textContent = allCount;
  }

  function renderMobileList() {
    const st = getActiveStation();
    const tag = root.querySelector('#txtStationName');
    if (tag) tag.textContent = `📍 ${st.name}`;

    updateCounts();

    // Mode Buttons Highlight
    root.querySelectorAll('.transit-mode-selector .mode-btn').forEach((btn) => {
      const mode = btn.getAttribute('data-mode');
      if (mode === filterMode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Preset Chip Highlight
    root.querySelectorAll('[data-station]').forEach((chip) => {
      if (chip.getAttribute('data-station') === currentStationKey) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });

    const items = getFilteredItems();
    if (lineIdx >= items.length) lineIdx = 0;
    const activeItem = items[lineIdx] || items[0];

    // Update Active HUD Card
    if (activeItem) {
      const badgeMode = root.querySelector('#badgeCurrentMode');
      const hudIdx = root.querySelector('#txtHudIndex');
      const activeBadge = root.querySelector('#activeBadge');
      const activeDest = root.querySelector('#activeDest');
      const activeEta = root.querySelector('#activeEta');
      const activeStatus = root.querySelector('#activeStatus');
      const activeCrowded = root.querySelector('#activeCrowded');

      if (badgeMode) {
        badgeMode.textContent = activeItem.type === 'METRO' ? '🚇 지하철' : '🚌 버스';
        badgeMode.style.color = activeItem.type === 'METRO' ? '#4ade80' : '#38bdf8';
      }
      if (hudIdx) hudIdx.textContent = `(${lineIdx + 1}/${items.length})`;
      if (activeBadge) {
        activeBadge.textContent = activeItem.routeNo;
        activeBadge.className = `badge ${activeItem.badgeClass}`;
      }
      if (activeDest) activeDest.textContent = activeItem.dest;
      if (activeEta) {
        activeEta.textContent = formatDigital(activeItem.remainSec);
        activeEta.style.color = activeItem.remainSec <= 60 ? '#f87171' : '#fde047';
      }
      if (activeStatus) {
        activeStatus.textContent = `🚩 ${activeItem.stopsLeft}${activeItem.type === 'METRO' ? '정거장 전' : '번째 전'} · ${activeItem.currentLoc}`;
      }
      if (activeCrowded) {
        activeCrowded.textContent = activeItem.crowded;
        activeCrowded.style.color = activeItem.crowded === '혼잡' ? '#f87171' : (activeItem.crowded === '여유' ? '#4ade80' : '#fde047');
      }
    }

    // Render Routes Container
    const container = root.querySelector('#transitListContainer');
    if (container) {
      if (items.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b; font-size:12px;">선택한 모드의 노선 정보가 없습니다.</div>';
        return;
      }

      container.innerHTML = items.map((it, idx) => {
        const isCurrent = idx === lineIdx;
        const isMetro = it.type === 'METRO';
        const typeBadge = isMetro ? '🚇 지하철' : '🚌 버스';
        const etaText = formatTime(it.remainSec);
        const etaColor = it.remainSec <= 60 ? '#f87171' : '#fde047';

        return `
          <div class="transit-row ${isCurrent ? 'active-row' : ''}" data-idx="${idx}" style="cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid ${isCurrent ? '#00f0ff' : (isMetro ? '#4ade80' : '#38bdf8')}; background: ${isCurrent ? 'rgba(0, 240, 255, 0.12)' : 'rgba(255,255,255,0.03)'};">
            <div style="flex: 1; padding-right: 10px;">
              <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                <span class="badge ${it.badgeClass}" style="font-size: 11px;">${it.routeNo}</span>
                <span style="font-size: 10px; color: ${isMetro ? '#4ade80' : '#38bdf8'}; font-weight: bold;">[${typeBadge}]</span>
                ${isCurrent ? '<span style="font-size: 10px; color: #00f0ff; background: rgba(0, 240, 255, 0.2); padding: 1px 5px; border-radius: 4px; font-weight: bold;">안경 송출</span>' : ''}
              </div>
              <div style="font-size: 12px; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${it.dest}</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                🚩 ${it.stopsLeft}${isMetro ? '정거장 전' : '번째 전'} (${it.currentLoc}) · <span style="color: ${it.crowded === '혼잡' ? '#f87171' : '#4ade80'};">${it.crowded}</span>
              </div>
            </div>
            <div style="text-align: right; min-width: 80px;">
              <strong style="display: block; font-size: 15px; color: ${etaColor}; font-family: monospace;">${etaText}</strong>
              <span style="font-size: 10px; color: #64748b;">${it.nextArrival}</span>
            </div>
          </div>
        `;
      }).join('');

      // Click to pin to Glasses HUD
      container.querySelectorAll('.transit-row').forEach((row) => {
        row.addEventListener('click', (e) => {
          const idx = parseInt(row.getAttribute('data-idx'), 10);
          if (!isNaN(idx)) {
            lineIdx = idx;
            renderMobileList();
            renderGlassHUD();
          }
        });
      });
    }
  }

  function renderGlassHUD() {
    if (!isActive) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    const station = getActiveStation();
    const items = getFilteredItems();
    if (items.length === 0) return;
    if (lineIdx >= items.length) lineIdx = 0;
    const item = items[lineIdx];
    const isMetro = item.type === 'METRO';

    // 1. Top Status Bar
    const headerColor = isMetro ? '#4ade80' : '#38bdf8';
    ctx.fillStyle = headerColor;
    ctx.font = 'bold 15px sans-serif';
    const modeLabel = filterMode === 'METRO' ? '지하철 모드' : (filterMode === 'BUS' ? '버스 모드' : '통합 모드');
    ctx.fillText(`${isMetro ? '🚇' : '🚌'} K-Transit | ${modeLabel} (${lineIdx + 1}/${items.length})`, 24, 34);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`📍 ${station.shortName} · 📡 GPS`, W - 24, 34);
    ctx.textAlign = 'left';

    // Thin separator line
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 46);
    ctx.lineTo(W - 24, 46);
    ctx.stroke();

    // 2. Category & Route Title (Bold 32px)
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`[${item.category}]`, 24, 76);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(item.routeNo, 105, 78);

    // Destination
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '15px sans-serif';
    ctx.fillText(`방면: ${item.dest}`, 24, 110);

    // 3. Huge ETA Timer (56px)
    const min = Math.floor(item.remainSec / 60);
    const sec = item.remainSec % 60;
    const timeText = min > 0 ? `${min}분 ${sec.toString().padStart(2, '0')}초 후` : `${sec}초 후 진입!`;

    ctx.fillStyle = item.remainSec <= 60 ? '#f87171' : '#fde047';
    ctx.font = 'bold 56px monospace';
    ctx.fillText(timeText, 24, 180);

    // 4. Telemetry (Current Location, Stops, Congestion)
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 17px sans-serif';
    const stopsUnit = isMetro ? '정거장 전' : '번째 전';
    ctx.fillText(`현재: ${item.currentLoc} (🚩 ${item.stopsLeft}${stopsUnit})`, 24, 222);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText(`열차/차량 혼잡도: `, 24, 248);

    ctx.fillStyle = item.crowded === '혼잡' ? '#f87171' : (item.crowded === '여유' ? '#4ade80' : '#fde047');
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(item.crowded, 140, 248);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText(`· 배차: ${item.nextArrival}`, 185, 248);

    // 5. Footer Separator & Navigation hint
    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(24, 276);
    ctx.lineTo(W - 24, 276);
    ctx.stroke();

    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('1-CLK: 시간 새로고침  |  2-CLK: 다음 노선  |  3-CLK: [지하철/버스] 전환  |  HOLD: 홈', W / 2, 312);
    ctx.textAlign = 'left';

    renderer.render(ctx).catch(() => {});
  }

  // Find nearest station by GPS coordinates
  function locateNearestStation(userLat, userLng) {
    let nearestKey = 'gangnam';
    let minDistance = Infinity;

    for (const [key, st] of Object.entries(STATIONS)) {
      const dist = haversineDistMeters(userLat, userLng, st.lat, st.lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearestKey = key;
      }
    }

    currentStationKey = nearestKey;
    lineIdx = 0;
    renderMobileList();
    renderGlassHUD();
  }

  async function requestGpsLocation() {
    const tag = root.querySelector('#txtGpsStatus');
    if (tag) tag.textContent = '[📡 GPS 탐색 중...]';

    if (scopedHub.location?.getCurrentPosition) {
      try {
        const pos = await scopedHub.location.getCurrentPosition({ timeoutMs: 10000 });
        if (pos && Number.isFinite(pos.latitude) && Number.isFinite(pos.longitude)) {
          locateNearestStation(pos.latitude, pos.longitude);
          if (tag) tag.textContent = '[📡 GPS 위치 반영]';
          return;
        }
      } catch (err) {
        console.warn('[Transit] PhoneSDK getCurrentPosition error:', err);
      }
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          locateNearestStation(pos.coords.latitude, pos.coords.longitude);
          if (tag) tag.textContent = '[📡 GPS 위치 반영]';
        },
        (err) => {
          console.warn('[Transit] Browser GPS error:', err);
          if (tag) tag.textContent = '[📡 기본 거점 기준]';
          renderMobileList();
          renderGlassHUD();
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }

  // --- Real-Time Countdown Tick (Every 1s) ---
  function startCountdownTimer() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      if (!isActive) return;
      const st = getActiveStation();
      let changed = false;

      st.items.forEach((it) => {
        if (it.remainSec > 0) {
          it.remainSec -= 1;
          changed = true;
        } else {
          // Reset to realistic incoming vehicle schedule
          it.remainSec = it.type === 'METRO' ? Math.floor(Math.random() * 120 + 180) : Math.floor(Math.random() * 240 + 300);
          changed = true;
        }
      });

      if (changed) {
        renderMobileList();
        renderGlassHUD();
      }
    }, 1000);
  }

  // --- Button Listeners (Temple Actions) ---
  scopedHub.device.onButton((e) => {
    const act = String(e.action || '').toLowerCase();
    const isSingle = act === 'click' || act === 'single' || act === 'singleclick' || act === 'one';
    const isDouble = act === 'double' || act === 'doubleclick' || act === 'two';
    const isTriple = act === 'triple' || act === 'tripleclick' || act === 'three';

    const items = getFilteredItems();

    if (isSingle) {
      // 1-Click: Instant Refresh / subtract 15s simulation
      if (items[lineIdx]) {
        items[lineIdx].remainSec = Math.max(10, items[lineIdx].remainSec - 15);
      }
      renderMobileList();
      renderGlassHUD();
    } else if (isDouble) {
      // 2-Click: Cycle to next route within active mode
      if (items.length > 0) {
        lineIdx = (lineIdx + 1) % items.length;
        renderMobileList();
        renderGlassHUD();
      }
    } else if (isTriple) {
      // 3-Click: Cycle mode (Subway -> Bus -> All -> Subway...)
      if (filterMode === 'METRO') {
        filterMode = 'BUS';
      } else if (filterMode === 'BUS') {
        filterMode = 'ALL';
      } else {
        filterMode = 'METRO';
      }
      lineIdx = 0;
      renderMobileList();
      renderGlassHUD();
    }
  });

  // --- Mobile UI Event bindings ---
  root.querySelector('[data-action="home"]')?.addEventListener('click', () => {
    isActive = false;
    if (countdownTimer) clearInterval(countdownTimer);
    navigate('home');
  });

  root.querySelector('#btnGpsTransit')?.addEventListener('click', () => {
    requestGpsLocation();
  });

  // Mode Selection Tabs (지하철 / 버스 / 전체)
  root.querySelector('#btnModeMetro')?.addEventListener('click', () => {
    filterMode = 'METRO';
    lineIdx = 0;
    renderMobileList();
    renderGlassHUD();
  });

  root.querySelector('#btnModeBus')?.addEventListener('click', () => {
    filterMode = 'BUS';
    lineIdx = 0;
    renderMobileList();
    renderGlassHUD();
  });

  root.querySelector('#btnModeAll')?.addEventListener('click', () => {
    filterMode = 'ALL';
    lineIdx = 0;
    renderMobileList();
    renderGlassHUD();
  });

  // Preset Chips
  root.querySelectorAll('[data-station]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const stationKey = e.currentTarget.getAttribute('data-station');
      if (STATIONS[stationKey]) {
        currentStationKey = stationKey;
        lineIdx = 0;
        renderMobileList();
        renderGlassHUD();
      }
    });
  });

  scopedHub.on('runtime.lifecycleChanged', (e) => {
    if (e.state === 'suspended' || e.state === 'stopped' || e.state === 'closed') {
      isActive = false;
      if (countdownTimer) clearInterval(countdownTimer);
    } else if (e.state === 'running') {
      isActive = true;
      startCountdownTimer();
      renderGlassHUD();
    }
  });

  renderMobileList();
  renderGlassHUD();
  startCountdownTimer();
}

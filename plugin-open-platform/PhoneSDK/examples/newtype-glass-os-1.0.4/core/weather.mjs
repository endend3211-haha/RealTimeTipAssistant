// Open-Meteo Public Zero-Key Weather Service
import { vault } from './vault.mjs';

export const WEATHER_CODES = {
  0: ['맑음', 'sun'],
  1: ['대체로 맑음', 'sun'],
  2: ['구름 조금', 'cloud'],
  3: ['흐림', 'cloud'],
  45: ['안개', 'fog'],
  48: ['서리 안개', 'fog'],
  51: ['이슬비', 'rain'],
  53: ['가벼운 비', 'rain'],
  55: ['강한 이슬비', 'rain'],
  61: ['소나기', 'rain'],
  63: ['비', 'rain'],
  65: ['장대비', 'rain'],
  71: ['가벼운 눈', 'snow'],
  73: ['눈', 'snow'],
  75: ['폭설', 'snow'],
  80: ['소나기', 'rain'],
  81: ['강한 소나기', 'rain'],
  82: ['폭우', 'storm'],
  95: ['뇌우', 'storm'],
  96: ['우박 뇌우', 'storm'],
  99: ['강한 뇌우', 'storm'],
};

export function getWeatherDesc(code) {
  return WEATHER_CODES[code] || ['맑음', 'sun'];
}

let cachedWeather = null;
let lastFetchedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

export async function fetchLiveWeather(force = false) {
  const now = Date.now();
  if (!force && cachedWeather && now - lastFetchedAt < CACHE_TTL_MS) {
    return cachedWeather;
  }

  const lat = vault.get('weather.latitude', 37.5665);
  const lon = vault.get('weather.longitude', 126.9780);
  const cityName = vault.get('weather.manualCity', '서울');

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&timezone=auto&forecast_days=1`;

  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cachedWeather = {
      city: cityName,
      current: data.current,
      hourly: data.hourly,
      fetchedAt: now,
    };
    lastFetchedAt = now;
    return cachedWeather;
  } catch (e) {
    console.warn('[Weather] Fetch failed:', e);
    return cachedWeather || {
      city: cityName,
      current: {
        temperature_2m: 15.0,
        apparent_temperature: 14.2,
        relative_humidity_2m: 50,
        weather_code: 0,
        wind_speed_10m: 8.5,
      },
      hourly: null,
      fetchedAt: now,
      error: e.message,
    };
  }
}


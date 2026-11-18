// 0.8.32 ad breaks; 0.8.33 video ads (AdFilm, playFilm) (owner: "can we reuse that downtime for ads, make our own ads, they need to have sound";
// "mixed ads, include useful from real data, weather etc"; ZIP ). While a channel loads, the glasses show an
// ad card and the phone plays its voice; the ad stops at once when the channel is ready, so a switch never gets
// slower. Fake ads were written by Claude; voices are clips made once on the PC (pc/make_ads.py, kokoro) and served
// by the engine at /ad/<name>.mp3; the weather card reads /ad/weather (Open-Meteo, the island). The time and weather
// voices are stitched from a fixed word bank (no speech is made on the phone). Pure: tested in node with fakes.
export const ADS_KEY = 'mmvideo.ads';
export const AD_DELAY_MS = 1500;          // the channel has this long to show before an ad starts
export const AD_MIN_SWITCH_MS = 2000;     // no ads when switches have lately been quicker than this
export const WEATHER_GAP_MS = 15 * 60e3;  // the weather ad at most once per 15 minutes
export const AD_MIN_SHOW_MS = 3500;       // an ad whose voice is missing still stays up this long
export const AD_GAP_S = 0.04;             // silence between stitched words
// 0.8.34 (owner: "It can cut midway when channel is ready ... and can stretch for a while ... realism but not true
// live, just perception"; "Use the mix ad for short waits, the long one for long waits"; "the weather needs to be better")
export const AD_STRETCH_MS = 4000;        // a full video ad this close to its end plays out before the channel shows
export const AD_STRETCH_SEG_MS = 1500;    // a montage ad finishes the gadget on show when that takes at most this long
export const LONG_WAIT_MS = 6000;         // switches lately this slow (median) get the long ad first, else the montage
export const AD_FADE_S = 0.3;             // an ad voice cut midway fades out instead of a click

/** Fake ads (written by Claude, 2026-11-08). icon = Material Symbols Rounded name (see adart.js). */
export const FAKE_ADS = [
  { id: 'snooze', icon: 'snooze', name: 'Snooze Insurance', line: 'Five more minutes, guaranteed.', film: 'vid_snooze',
    voice: 'Overslept again? Get Snooze Insurance. Five more minutes, fully covered. Terms and naps apply.' },
  { id: 'gadgets', icon: 'sunny', name: 'Gadget Hour', line: 'Eight things nobody asked for.', film: 'vid_gadgets', seg: 10,   // 8 gadgets x 10 frames: a cut lands between two gadgets
    voice: 'It is the Gadget Hour. Iguana repellers, sunburn shields, instant mojitos. Eight things nobody asked for. Operators are standing by. Probably.' },
  { id: 'air', icon: 'air', name: 'Island Air in a Can', line: 'Now with real rooster.',
    voice: 'Miss the island? Island Air in a Can. Sunscreen, salt, and a real rooster. Just crack it open.' },
  { id: 'hat', icon: 'visibility_off', name: 'The Invisible Hat', line: 'You will not believe it is there.',
    voice: 'Introducing the Invisible Hat. Nobody will see it. Not even you. Batteries not included. Or visible.' },
  { id: 'decaf', icon: 'eyeglasses', name: 'Decaf Glasses', line: 'See everything, just more calmly.',
    voice: 'Is the world too sharp? Try Decaf Glasses. Everything you see, now with half the excitement.' },
  { id: 'finder', icon: 'settings_remote', name: 'Remote Finder Finder', line: 'For when you lost the finder.',
    voice: 'Lost the remote finder? Remote Finder Finder finds it. Lost that too? Ask about our Finder Finder Finder.' },
  { id: 'gravy', icon: 'soup_kitchen', name: 'Gravy Cologne', line: 'By Uncle Ray. Bold. Brown. Beefy.',
    voice: 'Gravy Cologne, by Uncle Ray. For the man who wants to smell like Thanksgiving. All year long.' },
  { id: 'storm', icon: 'thunderstorm', name: 'Pocket Thunderstorm', line: 'Weather, wherever you go.',
    voice: 'Too sunny? Pull out your Pocket Thunderstorm. Your own private rain cloud. Umbrella sold separately.' },
  { id: 'eggs', icon: 'egg_alt', name: 'Self-Cracking Eggs', line: 'Breakfast that tries harder.',
    voice: 'Tired of cracking eggs? Self-Cracking Eggs do it for you. Just tell them a really bad joke.' },
  { id: 'sock', icon: 'footprint', name: 'One Sock Club', line: 'A single sock, every month.',
    voice: 'Join the One Sock Club. Every month, one sock, never the same color. Because the dryer already won.' },
  { id: 'spoon', icon: 'bluetooth', name: 'Bluetooth Spoon', line: 'Soup, now wireless.',
    voice: 'The Bluetooth Spoon. Pairs with any bowl. Now your soup has a signal. Please charge before stirring.' },
  { id: 'cat', icon: 'pets', name: 'Cat Translator', line: 'Spoiler: it is dinner.',
    voice: 'Ever wonder what your cat is saying? The Cat Translator tells you. Spoiler. It is dinner. It is always dinner.' },
  { id: 'patience', icon: 'hourglass_top', name: 'Instant Patience', line: 'Just add water, wait thirty minutes.',
    voice: 'Instant Patience. Just add water and wait thirty minutes. If it did not work, wait longer.' },
];

/** WMO weather code -> condition (Open-Meteo weather_code). */
export function wxCondition(code) {
  const c = Number(code) || 0;
  if (c === 0 || c === 1) return { key: 'c_clear', text: 'Clear', icon: 'sunny' };
  if (c === 2) return { key: 'c_partly', text: 'Partly cloudy', icon: 'partly_cloudy_day' };
  if (c === 3) return { key: 'c_cloudy', text: 'Cloudy', icon: 'cloud' };
  if (c === 45 || c === 48) return { key: 'c_fog', text: 'Foggy', icon: 'foggy' };
  if (c >= 51 && c <= 57) return { key: 'c_drizzle', text: 'Drizzle', icon: 'rainy' };
  if ((c >= 61 && c <= 67)) return { key: 'c_rain', text: 'Rain', icon: 'rainy' };
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { key: 'c_snow', text: 'Snow', icon: 'weather_snowy' };
  if (c >= 80 && c <= 82) return { key: 'c_showers', text: 'Showers', icon: 'rainy' };
  if (c >= 95) return { key: 'c_storm', text: 'Thunderstorms', icon: 'thunderstorm' };
  return { key: 'c_cloudy', text: 'Cloudy', icon: 'cloud' };
}

/** The word bank the PC makes once: name -> words spoken. Numbers 0..119 are whole clips (n0..n119). */
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth',
  'nineteenth', 'twentieth'];
export function sayNumber(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  return `one hundred${n % 100 ? ` ${sayNumber(n % 100)}` : ''}`;
}
export function sayOrdinal(n) {
  if (n <= 20) return ORD[n];
  if (n === 30) return 'thirtieth';
  return `${TENS[Math.floor(n / 10)]}-${ORD[n % 10]}`;
}
export function wordBank() {
  const bank = {
    wx_intro: "Here's your local weather.", right_now: "Right now, it's", degrees: 'degrees,',
    high_of: "Today's high,", low_of: 'and the low,', its: "It's", oh: 'oh', oclock: "o'clock", am: 'A M.', pm: 'P M.',
    stay_tuned: 'Stay tuned. More great shows, right after this.', time_intro: 'Your M M Video time check.',
    c_clear: 'and clear.', c_partly: 'and partly cloudy.', c_cloudy: 'and cloudy.', c_fog: 'and foggy.',
    c_drizzle: 'with drizzle.', c_rain: 'with rain.', c_snow: 'with snow.', c_showers: 'with showers.',
    c_storm: 'with thunderstorms.',
    // 0.8.34 richer weather
    feels_like: 'It feels like', deg_end: 'degrees.', rain_chance: 'Chance of rain today,', percent: 'percent.',
    wind_at: 'Breezy, winds at', mph: 'miles per hour.', sunset_at: 'Sunset at', tmr_high: 'Tomorrow, a high of',
  };
  for (let n = 0; n < 120; n += 1) bank[`n${n}`] = sayNumber(n);
  DAYS.forEach((d, i) => { bank[`d${i}`] = `${d},`; });
  MONTHS.forEach((m, i) => { bank[`m${i + 1}`] = m; });
  for (let n = 1; n <= 31; n += 1) bank[`o${n}`] = `${sayOrdinal(n)}.`;
  for (const a of FAKE_ADS) bank[`spot_${a.id}`] = a.voice;
  return bank;
}

const num = (n) => (Number.isInteger(n) && n >= 0 && n < 120 ? [`n${n}`] : []);

const intOk = (n) => Number.isInteger(n);

/** "5:42 PM" from "17:42" or "2026-11-08T17:42" (the PC sends local time). */
export function clock12(hhmm) {
  const m = /(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return null;
  const h24 = Number(m[1]); const mm = Number(m[2]);
  if (h24 > 23 || mm > 59) return null;
  const h = h24 % 12 || 12;
  return { h, m: mm, pm: h24 >= 12, text: `${h}:${m[2]} ${h24 >= 12 ? 'PM' : 'AM'}` };
}

/** 0.8.34: says only what matters (feels like when 3+ off, rain from 20 %, wind from 15 mph) and, when the PC sends
 * hours / tomorrow / sunset, the glasses get a short animated forecast (weatherFrameSpec). */
export function weatherAd(w) {
  const cond = wxCondition(w.code);
  const clips = ['wx_intro', 'right_now', ...num(w.temp), 'degrees', cond.key];
  if (intOk(w.feels) && intOk(w.temp) && Math.abs(w.feels - w.temp) >= 3) clips.push('feels_like', ...num(w.feels), 'deg_end');
  if (w.hi != null) clips.push('high_of', ...num(w.hi));
  if (w.lo != null) clips.push('low_of', ...num(w.lo));
  if (intOk(w.rain) && w.rain >= 20 && w.rain <= 100) clips.push('rain_chance', ...num(w.rain), 'percent');
  if (intOk(w.wind) && w.wind >= 15) clips.push('wind_at', ...num(w.wind), 'mph');
  if (w.tom && intOk(w.tom.hi)) clips.push('tmr_high', ...num(w.tom.hi), wxCondition(w.tom.code).key);
  const ss = clock12(w.sunset);
  if (ss) clips.push('sunset_at', `n${ss.h}`, ...(ss.m === 0 ? ['oclock'] : ss.m < 10 ? ['oh', `n${ss.m}`] : [`n${ss.m}`]), ss.pm ? 'pm' : 'am');
  const place = String(w.place || 'the island').toUpperCase();
  const small = w.hi != null && w.lo != null ? `High ${w.hi}°   Low ${w.lo}°` : '';
  const ad = { id: 'weather', kind: 'weather', card: { icon: cond.icon, big: `${place} ${w.temp}°`, mid: cond.text, small }, clips };
  if (weatherScenes(w).length > 1) ad.wx = w;   // enough data for the animated forecast
  return ad;
}

export const WX_SCENE_MS = 4500;   // each forecast page stays this long
export const WX_SLIDE_MS = 400;    // pages slide in from the right
export const WX_COUNT_MS = 900;    // the temperature counts up to its value

/** The forecast pages a reading allows: now, then the next hours, then tomorrow. */
export function weatherScenes(w) {
  const out = ['now'];
  if (Array.isArray(w.next) && w.next.filter((x) => x && intOk(x.temp)).length >= 2) out.push('hours');
  if ((w.tom && intOk(w.tom.hi)) || clock12(w.sunset)) out.push('tomorrow');
  return out;
}

/** What one frame of the animated forecast shows at tMs. Pure, so tests see the scenes; key changes only when the
 * picture does (the page sends a frame only then). */
export function weatherFrameSpec(w, tMs) {
  const scenes = weatherScenes(w);
  const t = Math.max(0, tMs);
  const idx = Math.min(scenes.length - 1, Math.floor(t / WX_SCENE_MS));
  const local = t - idx * WX_SCENE_MS;
  const slide = idx > 0 && local < WX_SLIDE_MS ? Math.round((1 - local / WX_SLIDE_MS) * 4) / 4 : 0;   // 1 -> 0 in 4 steps
  const cond = wxCondition(w.code);
  const spec = { scene: scenes[idx], slide, place: String(w.place || 'the island').toUpperCase() };
  if (spec.scene === 'now') {
    const k = Math.min(1, t / WX_COUNT_MS);
    const from = intOk(w.temp) ? w.temp - 12 : 0;
    spec.temp = intOk(w.temp) ? Math.round(from + (w.temp - from) * (1 - (1 - k) ** 2)) : null;
    spec.icon = cond.icon; spec.text = cond.text;
    spec.feels = intOk(w.feels) && intOk(w.temp) && Math.abs(w.feels - w.temp) >= 3 ? w.feels : null;
    spec.hi = w.hi ?? null; spec.lo = w.lo ?? null;
  } else if (spec.scene === 'hours') {
    spec.hours = w.next.filter((x) => x && intOk(x.temp)).slice(0, 3)
      .map((x) => ({ h: String(x.h || '').slice(0, 6), temp: x.temp, icon: wxCondition(x.code).icon }));
    spec.rain = intOk(w.rain) ? w.rain : null; spec.wind = intOk(w.wind) ? w.wind : null;
  } else {
    const tc = wxCondition(w.tom?.code);
    spec.tom = w.tom && intOk(w.tom.hi) ? { hi: w.tom.hi, lo: w.tom.lo ?? null, icon: tc.icon, text: tc.text } : null;
    spec.sunset = clock12(w.sunset)?.text ?? null;
  }
  spec.key = JSON.stringify(spec);
  return spec;
}

/** How long the animated forecast runs: every page once. */
export function weatherShowMs(w) {
  return weatherScenes(w).length * WX_SCENE_MS;
}

export function clockAd(d) {
  const h24 = d.getHours();
  const h = h24 % 12 || 12;
  const m = d.getMinutes();
  const mins = m === 0 ? ['oclock'] : m < 10 ? ['oh', `n${m}`] : [`n${m}`];
  const clips = ['time_intro', 'its', `n${h}`, ...mins, h24 < 12 ? 'am' : 'pm', `d${d.getDay()}`, `m${d.getMonth() + 1}`, `o${d.getDate()}`];
  const card = { icon: 'schedule', big: `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`,
    mid: `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`, small: 'MM Video time check' };
  return { id: 'clock', kind: 'clock', card, clips };
}

/** The TV guide only knows what is on NOW (no "next"), so this ad says what is on another channel. */
export function guideAd(ch) {
  return { id: 'guide', kind: 'guide', card: { icon: 'live_tv', big: String(ch.name || '').slice(0, 24), mid: `Now: ${String(ch.now || '').slice(0, 40)}`, small: 'Stay tuned' }, clips: ['stay_tuned'] };
}

export function fakeAd(a) {
  const ad = { id: a.id, kind: 'fake', card: { icon: a.icon, big: a.name, mid: a.line, small: 'Paid programming. Not real.' }, clips: [`spot_${a.id}`] };
  if (a.film) ad.film = a.film;
  if (a.seg) ad.seg = a.seg;   // 0.8.33: a video ad (/ad/<film>.mmv + /ad/<film>.mp3); card + voice when it is not there
  return ad;
}

/** 0.8.33 video ads (owner sent a Gemini video, "One ad", then picked "3" = the whole video on the glasses).
 * The PC cuts the video once into grey frames (tools/clip2frames.py -> pc/ads/<name>.mmv) and its sound
 * (<name>.mp3); the engine serves both under /ad/. peek() never waits: the first break downloads the film in the
 * background and shows the card; later breaks play the film. */
export class AdFilm {
  constructor({ fetchFn, bases, parse, preload = () => {} }) { Object.assign(this, { fetchFn, bases, parse, preload }); this.cache = new Map(); }

  load(name) {
    if (this.cache.has(name)) return this.cache.get(name).p;
    const entry = { clip: null, p: null };
    entry.p = (async () => {
      for (const b of this.bases() || []) {
        if (!b) continue;
        try {
          const r = await this.fetchFn(`${String(b).replace(/\/+$/, '')}/ad/${name}.mmv`);
          if (!r || !r.ok) continue;
          entry.clip = this.parse(new Uint8Array(await r.arrayBuffer()));
          return entry.clip;
        } catch { /* next engine */ }
      }
      this.cache.delete(name);   // try again next break (the engine may come up)
      return null;
    })();
    this.cache.set(name, entry);
    this.preload(name);          // the sound too, so pictures and voice start together
    return entry.p;
  }

  /** The film if it is already here, else null (and start getting it). */
  peek(name) {
    const e = this.cache.get(name);
    if (e) return e.clip;
    this.load(name).catch(() => {});
    return null;
  }
}

/** Sends the frame the wall clock is at; a frame that is late is skipped, so the film keeps time with its sound
 * on a slow link (fewer pictures, never a slower film). Stops at once when live() turns false. */
export async function playFilm(clip, { send, live, now, wait, from = 0, to = clip.count }) {
  const fps = Math.max(1, clip.fps || 8);
  const t0 = now();
  const end = Math.min(clip.count, to);
  let last = -1;
  let sent = 0;
  while (live()) {
    const i = from + Math.floor((now() - t0) * fps / 1000);
    if (i >= end) break;
    if (i > last) {
      last = i;
      try { await send(i); sent += 1; } catch { /* a lost frame: the next one is a keyframe */ }
    } else {
      await wait(Math.max(1, Math.ceil(t0 + (i - from + 1) * 1000 / fps - now())));
    }
  }
  return sent;
}

/** Picks the next ad: two fake, then one useful (weather / clock / guide), never the same ad twice in a row, the
 * weather at most once per WEATHER_GAP_MS. */
export class AdPicker {
  constructor({ rand = Math.random, now = () => Date.now() } = {}) {
    this.rand = rand; this.now = now; this.count = 0; this.last = null; this.bag = []; this.lastWeather = -Infinity; this.useful = 0;
  }

  nextFake() {
    if (!this.bag.length) {
      this.bag = FAKE_ADS.slice();
      for (let i = this.bag.length - 1; i > 0; i -= 1) {
        const j = Math.floor(this.rand() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (this.bag[this.bag.length - 1].id === this.last) this.bag.unshift(this.bag.pop());
    }
    return fakeAd(this.bag.pop());
  }

  /** weather: the last reading ({ok,temp,...}) or null; guide(): a channel {name, now} or null. */
  /** 0.8.34: the first ad of a break follows the wait: the montage (gadgets, starting at a later gadget each time) for
   * short or unknown waits, the long ad (snooze) when switches are lately slow (waitMs >= LONG_WAIT_MS). */
  pick({ weather = null, guide = () => null, date = new Date(), waitMs = null, first = false } = {}) {
    this.count += 1;
    let ad = null;
    if (first && this.count % 3 !== 0) {
      const want = waitMs != null && waitMs >= LONG_WAIT_MS ? 'snooze' : 'gadgets';
      const a = FAKE_ADS.find((x) => x.id === want);
      if (a) {
        ad = fakeAd(a);
        if (a.seg) { ad.part = this.part || 0; this.part = ad.part + 1; }
        this.bag = this.bag.filter((x) => x.id !== want);
        this.last = ad.id;
        return ad;
      }
    }
    if (this.count % 3 === 0) {
      const opts = [];
      if (weather && weather.ok && this.now() - this.lastWeather >= WEATHER_GAP_MS) opts.push('weather');
      opts.push('clock');
      const ch = guide();
      if (ch && ch.name && ch.now) opts.push('guide');
      const pool = opts.filter((o) => o !== this.last);
      const kind = pool.includes('weather') ? 'weather' : pool[this.useful++ % pool.length];
      if (kind === 'weather') { ad = weatherAd(weather); this.lastWeather = this.now(); }
      else if (kind === 'guide') ad = guideAd(ch);
      else ad = clockAd(date);
    }
    if (!ad || ad.id === this.last) ad = this.nextFake();
    if (ad.id === this.last) ad = this.nextFake();
    this.last = ad.id;
    return ad;
  }
}

/** Times one switch: tap -> first picture -> first sound. typical() = median of the last 5 (null under 3). */
export class SwitchTimer {
  constructor({ now = () => Date.now(), keep = 5 } = {}) { this.now = now; this.keep = keep; this.times = []; this.cur = null; }

  begin(label = '', who = '') { this.cur = { t0: this.now(), label, who, picture: null, sound: null }; return this.cur; }

  mark(what) {
    const c = this.cur;
    if (!c || c[what] != null) return null;
    c[what] = this.now() - c.t0;
    if (what === 'picture') { this.times.push(c.picture); if (this.times.length > this.keep) this.times.shift(); }
    return c[what];
  }

  summary() {
    const c = this.cur;
    if (!c || c.picture == null) return '';
    const s = (ms) => `${(ms / 1000).toFixed(1)} s`;
    return `switch ${s(c.picture)}${c.who ? ` (${c.who})` : ''}${c.sound != null ? `, sound at ${s(c.sound)}` : ''}${c.label ? ` - ${c.label}` : ''}`;
  }

  typical() {
    if (this.times.length < 3) return null;
    const t = this.times.slice().sort((a, b) => a - b);
    return t[Math.floor(t.length / 2)];
  }

  quick() { const t = this.typical(); return t != null && t < AD_MIN_SWITCH_MS; }
}

/** Plays stitched clips through one AudioContext (Web Audio: stops at once, works over http). */
export class AdSound {
  constructor({ ctx, fetchFn, bases }) { this.ctx = ctx; this.fetchFn = fetchFn; this.bases = bases; this.cache = new Map(); this.srcs = []; this.done = null; }

  async load(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const p = (async () => {
      const c = this.ctx();
      if (!c) return null;   // no AudioContext on this phone: cards only
      for (const b of this.bases() || []) {
        if (!b) continue;
        try {
          const r = await this.fetchFn(`${String(b).replace(/\/+$/, '')}/ad/${name}.mp3`);
          if (!r || !r.ok) continue;
          return await c.decodeAudioData(await r.arrayBuffer());
        } catch { /* next engine */ }
      }
      return null;
    })();
    this.cache.set(name, p);
    const buf = await p;
    if (!buf) this.cache.delete(name);   // try again next time (the engine may come up)
    return buf;
  }

  /** Resolves with the seconds played (0 when nothing could be played) when the clips end or stop() is called. */
  async play(clips, { offset = 0 } = {}) {
    this.stop();
    const token = {};
    this.token = token;
    const bufs = (await Promise.all(clips.map((n) => this.load(n)))).filter(Boolean);
    if (this.token !== token || !bufs.length) return 0;
    const c = this.ctx();
    if (!c) return 0;
    if (c.state === 'suspended' && c.resume) { try { await c.resume(); } catch { /* still try */ } }
    let at = c.currentTime + 0.05;
    const t0 = at;
    let out = c.destination;
    this.gain = null;
    if (c.createGain) { try { this.gain = c.createGain(); this.gain.connect(c.destination); out = this.gain; } catch { this.gain = null; } }
    let skip = Math.max(0, Number(offset) || 0);   // 0.8.34: a montage that starts at a later gadget starts its voice there too
    for (const b of bufs) {
      if (skip >= b.duration) { skip -= b.duration; continue; }
      const s = c.createBufferSource();
      s.buffer = b; s.connect(out);
      if (skip > 0) s.start(at, skip); else s.start(at);
      this.srcs.push(s);
      at += b.duration - skip + AD_GAP_S;
      skip = 0;
    }
    if (!this.srcs.length) return 0;
    const last = this.srcs[this.srcs.length - 1];
    return new Promise((resolve) => {
      this.done = () => { this.done = null; resolve(at - t0); };
      last.onended = () => { if (this.done) this.done(); };
    });
  }

  /** fade (seconds): ramp the voice down, then stop (0.8.34, a cut midway); 0 = at once. */
  stop({ fade = 0 } = {}) {
    this.token = null;
    let end = null;
    if (fade > 0 && this.gain && this.srcs.length) {
      try {
        const c = this.ctx();
        const t = c.currentTime;
        this.gain.gain.setValueAtTime(this.gain.gain.value, t);
        this.gain.gain.linearRampToValueAtTime(0, t + fade);
        end = t + fade;
      } catch { end = null; }
    }
    for (const s of this.srcs) { try { s.onended = null; if (end != null) s.stop(end); else s.stop(); } catch { /* not started */ } }
    this.srcs = [];
    this.gain = null;
    if (this.done) this.done();
  }
}

/** One ad break per switch: arm() at the tap; after AD_DELAY_MS still loading -> ads one after another until end(). */
export class AdBreak {
  constructor({ wait, show, sound, picker, weather = async () => null, guide = () => null, on = () => true, timer = null, log = () => {}, after = () => {}, film = null, showFilm = null, showWeather = null, now = () => Date.now() }) {
    Object.assign(this, { wait, show, sound, picker, weather, guide, on, timer, log, after, film, showFilm, showWeather, now });
    this.run = null; this.wx = null; this.sending = null;
  }

  arm(label = '') {
    this.end();
    if (!this.on()) return false;
    if (this.timer && this.timer.quick()) { this.log(`ads: skipped (switches are quick, ${(this.timer.typical() / 1000).toFixed(1)} s)`); return false; }
    const run = { live: true, shown: 0 };
    this.run = run;
    const wx = this.weather().then((w) => { if (w && w.ok) this.wx = w; }).catch(() => {});
    this.wait(AD_DELAY_MS).then(async () => {
      await Promise.race([wx, this.wait(300)]);
      while (run.live && this.run === run && !run.ending) {
        const waitMs = this.timer && this.timer.typical ? this.timer.typical() : null;
        const ad = this.picker.pick({ weather: this.wx, guide: this.guide, first: run.shown === 0, waitMs });
        if (!run.live) break;
        run.shown += 1;
        const clip = ad.film && this.film && this.showFilm ? this.film.peek(ad.film) : null;
        this.log(`ad: ${ad.card.big}${clip ? ' (video)' : ''}${label ? ` (loading ${label})` : ''}`);
        if (clip) {
          const live = () => run.live && this.run === run;
          let from = 0;
          if (ad.seg && ad.part != null) {   // the montage starts at a later gadget each time, leaving at least 4
            const steps = Math.floor(Math.max(0, clip.count - 4 * ad.seg) / ad.seg) + 1;
            from = (ad.part % steps) * ad.seg;
          }
          const fps = Math.max(1, clip.fps || 8);
          const voice = this.sound.play([ad.film], { offset: from / fps }).catch(() => 0);
          run.film = { t0: this.now(), fps, from, to: clip.count, seg: ad.seg || 0 };
          this.sending = Promise.resolve(this.showFilm(clip, live, { from, to: clip.count })).catch((e) => { this.log(`ad video: ${e?.message ?? e}`); });
          await this.sending;
          run.film = null;
          if (run.live && !run.ending) await voice;
          if (run.live && !run.ending) await this.wait(400);
          continue;
        }
        if (ad.wx && this.showWeather) {   // 0.8.34 animated forecast, voice alongside
          const live = () => run.live && this.run === run;
          const voice = this.sound.play(ad.clips).catch(() => 0);
          this.sending = Promise.resolve(this.showWeather(ad.wx, live, { ms: weatherShowMs(ad.wx) })).catch((e) => { this.log(`ad weather: ${e?.message ?? e}`); });
          await Promise.all([this.sending, voice]);
          if (run.live && !run.ending) await this.wait(400);
          continue;
        }
        this.sending = Promise.resolve(this.show(ad, () => run.live && this.run === run)).catch((e) => { this.log(`ad card: ${e?.message ?? e}`); });
        try { await this.sending; } catch (e) { this.log(`ad card: ${e?.message ?? e}`); }
        if (!run.live) break;
        const t0 = Date.now();
        const secs = await this.sound.play(ad.clips).catch(() => 0);
        if (!run.live) break;
        const left = AD_MIN_SHOW_MS - (Date.now() - t0);
        if (!secs && left > 0) await this.wait(left);
        if (run.live) await this.wait(400);
      }
    });
    return true;
  }

  /** Stops the ad at once. Returns how many ads this break showed. */
  end() {
    const r = this.run;
    this.run = null;
    if (!r) return 0;
    const shown = r.live ? r.shown : 0;
    r.live = false;
    this.sound.stop({ fade: AD_FADE_S });
    if (shown) this.after(shown);
    return shown;
  }

  /** end(), then wait for a card send still on its way, so it can never land after the first video picture. */
  async finish() {
    const shown = this.end();
    const p = this.sending;
    this.sending = null;
    if (p) await p;
    return shown;
  }

  /** 0.8.34 the channel is ready: a video ad near a natural cut plays on to it (the gadget on show, or the end of
   * a long ad within AD_STRETCH_MS), then finish(). Anything else stops at once. A new switch meanwhile wins. */
  async settle() {
    const run = this.run;
    let left = 0;
    const f = run && run.live ? run.film : null;
    if (f) {
      const frame = f.from + (this.now() - f.t0) * f.fps / 1000;
      const cut = f.seg ? Math.min(f.to, (Math.floor(frame / f.seg) + 1) * f.seg) : f.to;
      left = Math.max(0, (cut - frame) * 1000 / f.fps);
      if (left > (f.seg && cut < f.to ? AD_STRETCH_SEG_MS : AD_STRETCH_MS)) left = 0;
    }
    if (left > 0) {
      run.ending = true;
      this.log(`ad: let it finish (${(left / 1000).toFixed(1)} s)`);
      await this.wait(Math.ceil(left));
      if (this.run !== run) return 0;
    }
    return this.finish();
  }

  get showing() { return !!(this.run && this.run.shown); }
}

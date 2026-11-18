// MM Video page wiring. Logic lives in core.js, yt.js (player) and captions.js.
import { createGMPlugin } from './vendor/gm-plugin-web-sdk.esm.js';
import { TapCounter } from './taps.js';
import { Hiss } from './hiss.js';
import { CHANNEL, SIZES, Streamer, parseGlass, plan, renderPattern, quantize, newestFile, parseMMV, mmvSource, CLEAR, HelloAsker, tuneBytes, saverBytes, crtBytes, smoothBytes, fitBytes, BUSY_BUDGET, BUSY_KEY_EVERY, SCENE_CUT, brightBytes, GLOW_LEVELS, fontBytes, CAP_FONTS, CAP_FONT_COLS, picWidth, capFit } from './core.js';
import { YtPlayer, DEFAULT_PC, cleanBase, isYoutube, levelsFor, filmFacts, newsFacts, tameBright, softWhites, shadowLift } from './yt.js';
import { needsBlobSound, soundBlobUrl, liveSoundPick } from './yt.js';   // 0.8.25: phone engine sound
import { CaptionTrack, liveLag, pcCaptions } from './captions.js';
import { EngineChooser, PHONE_ENGINE, pcFallback, cleanMode, isIptvId, iptvEngine } from './engine.js';   // 0.8.26: phone engine first, PC as fallback
import { cacheCopy, GUIDE_KEY, GROUP_KEY, HIDDEN_KEY, groupKey, trimGuide, tvGroups, needsFetch, lineOf, wrapIndex, liveNote, chipLabels, hideId, FAV_KEY, isFav, toggleFav, favGroup } from './tvguide.js';
import { FREEFIRST_KEY, freeFirst, isIptv } from './freefirst.js';
import { NATIVESOUND_KEY, NativeSound, linkHasSound, memoryLevel, copyAllowed, useNative } from './nativesound.js';   // 0.9.10
import { decompress as zstdDecompress } from './vendor/fzstd.esm.js';
import { createTouchpad, bindPadArea, PAD_ACTIONS, PAD_WORDS } from './touchpad.js';
import { Keeper } from './keep.js';   // 0.8.31: favorites, hidden channels and settings survive a reinstall
import { AdPicker, AdSound, AdBreak, SwitchTimer, ADS_KEY, AdFilm, playFilm, weatherFrameSpec, weatherShowMs } from './ads.js';   // 0.8.32: ad breaks while a channel switches
import { drawCard, drawWeather } from './adart.js';
import { pictureScale, pack4, encodePacked, KEY_EVERY, dimLum } from './core.js';
import { makeAwake } from './awake.js';   // 0.8.45: keep the screen on while a video plays
import { COVERS_KEY, TILEPICS_KEY, coverEl, ytThumb, hasLogoId, LogoCache, tilePick } from './covers.js';   // 0.9.2: covers
import { YTCHANS_KEY, YTCHANS_ON_KEY, FAVFIX_KEY, BUILTIN, cleanChans, chanKey, hasChan, addChan, removeChan, chanSeen, favFix, tilePhoto } from './chans.js';   // 0.9.3
import { WARM_KEY, WARM_EVERY_MS, warmTargets, warmReady, warmHot, sameList } from './warm.js';   // 0.9.5: next + previous channel ready
import { brightLevel } from './brightfix.js';   // 0.9.8: Bright scenes Strong / Tame / Plain
import { SWITCHFIX_KEY, SOUND_EVERY_MS, SOUND_TRIES, soundCheck, playWithin, keepPicture } from './switchfix.js';   // 0.9.7: no READY between channels + sound watchdog

const BUILD = '0.9.10';  // bump every build — must match manifest.json "version" so the phone shows the latest
const RUN_MS = 10000;
const RESULTS_KEY = 'videotest.results';
const $ = (id) => document.getElementById(id);
const logBox = $('log');
const log = (text) => { logBox.textContent = `${new Date().toLocaleTimeString()}  ${text}\n${logBox.textContent}`.slice(0, 4000); };

const gm = createGMPlugin();
// 0.8.31: every storage write of a kept key also goes (after a pause) to the phone engine and the PC, /prefs
const keeper = new Keeper({ storage: { get: gm.storage.get, set: gm.storage.set }, fetchFn: (url, opts) => fetch(url, opts), bases: () => engBases(), wait: (ms) => wait(ms), log: (t) => log(t) });
try { gm.storage.set = keeper.store.set; } catch { /* a locked storage object: no copy, the page still works */ }   // the page's own gm.storage.set calls now also keep the copy
const link = { send: (bytes) => gm.plugin.sendMessage(CHANNEL, bytes) };
const clock = () => performance.now();
const streamer = new Streamer(link, clock, () => new Promise((resolve) => { setTimeout(resolve, 0); }));
let glass = null;          // last HELLO
let glassStats = null;     // last STATS
// The owner's pick (2026-11-06): 200x112, Medium, sound on the phone, Dither, Delta. All still changeable in Settings.
let size = SIZES.find((s) => s[0] === 240 && s[1] === 135) || SIZES[0];   // 0.8.15: his sweet spot ("Fav settings so far 240x135")
let pattern = 'youtube';   // 'youtube' | 'library' | 'nas' (videos) | 'simple' | 'busy' | 'cartoon' | 'clip' (test tools)
let pack = 'delta';        // 'raw' | 'lz4' | 'delta' | 'sk' | 'sk2'
let clipFrames = null;     // parsed .mmv (preconverted clip) or null
let clipReady = false;
let clipName = '';
let savedClip = null;      // newest file already imported (gm.files.list on start), for one-tap restore
let busy = false;
let results = [];
let lastPreview = 0;
let stopAsked = false;

// Videos: the PC (pc/ytcast_pc.py over Tailscale /yt) makes the stills + sound from a YouTube link or a file on
// the NAS; yt.js plays them in step with the sound.
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
// Ask every second until HELLO comes (the first ask is refused while the glasses half starts: see core.js).
const asker = new HelloAsker(link.send, wait, { onTry: (n, e) => {
  if (e && (n === 1 || n % 10 === 0)) log(`ask ${n}: ${e?.code ?? e?.message ?? e}`);
  if (n === asker.tries && !glass) setStatus('안경 응답이 없습니다. 안경 플러그인을 시작한 뒤 다시 여세요.', false);
} });
const yt = new YtPlayer({ link, fetchFn: (url) => fetch(url, { cache: 'no-store' }), clock, pause: wait, base: PHONE_ENGINE });   // 0.9.0: the phone first
// 0.8.43: a second player used ONLY for captions on the PC while the phone engine plays (captions.js pcCaptions)
const capYt = new YtPlayer({ link, fetchFn: (url) => fetch(url, { cache: 'no-store' }), clock, pause: wait, base: DEFAULT_PC });
let sound = 'phone';       // 'phone' | 'pc' | 'off'
let picture = 'medium';    // 0.8.16: his pick (Medium = zoom x1 at 240x135, every pixel real; was 'full' in 0.8.15); 'big' | 'medium' | 'full' (whole screen, glasses v7) (about 2/3 the zoom = less for the glasses to draw), core.js pictureScale
let look = 'normal';       // 0.8.16: his pick (Normal; was 'dither' in 0.8.15). 'normal' | 'dither' (toned on the phone, yt.js) | 'manga' | 'auto' (made on the PC, pc/looks.py)
let ytReady = false;       // stills + (maybe) sound are on the PC for the current size
let ytLoading = false;
let loaded = null;         // what is loaded: { kind: 'youtube', url } | { kind: 'nas', rel, name } | { kind: 'live', url, name }
let loadTurn = 0;          // a newer load cancels the caption wait of an older one
let audio = null;          // <audio> for phone sound
let soundCopy = '';        // 0.8.25: blob: URL of the sound fetched from the phone engine (http), freed on the next load
let liveSound = null;      // 0.8.25: the live sound MediaSource feed from the phone engine ({ src, stop })
const soundFetch = (url, o = {}) => fetch(url, { cache: 'no-store', ...o });
function stopLiveSound() { if (liveSound) { liveSound.stop(); try { URL.revokeObjectURL(liveSound.src); } catch { /* gone */ } liveSound = null; } }
function dropSoundCopy() {
  stopLiveSound();
  if (soundCopy) { try { URL.revokeObjectURL(soundCopy); } catch { /* gone */ } soundCopy = ''; }
}
let lastLum = null;
let lastLook = 'normal';     // look of lastLum: 'manga'/'auto' frames are already flat 16 greys, 'full'/'normal' get dithered
let startAt = 0;           // seconds: where Start begins (the jump buttons move it while stopped)
let lastPos = 0;           // seconds: where the video is now
let liveJump = null;       // while a video plays: (seconds) => jump there
let captionsOn = true;
const capTrack = new CaptionTrack([]);
// 0.8.22 AI captions (owner: "since the audio is being downloaded cant we get a bot in there to make us captions?"):
// with the switch on, a video or channel without captions asks ytcast 0.7.6 for /subs?ai=1 and keeps asking while
// it plays (the PC stops listening 15 s after the last ask). Default off.
const AICAP_KEY = 'mmvideo.aicap';
let aiCaps = false;
// 0.8.43 Captions from: 'pc' = the PC writes them while the phone engine plays (not IPTV); off = the same engine.
const CAPPC_KEY = 'mmvideo.cappc';
let capPcOn = true;
let capTurn = 0;          // a new loadCaptions() ends the one before
let capAi = false;        // the captions on show are AI ones
let nasDir = '';           // folder on show in the NAS list ('' = the top)
let nasParent = null;      // its parent (null at the top)
let nasTimer = 0;
let nasTurn = 0;
let libTurn = 0;
let newsTurn = 0;
let showTurn = 0;
let showKey = '';            // 0.8.24: the show whose episodes are listed under the YouTube link box
let newsAgain = 0;         // how often the News list was asked again while the PC was still reading the channels
// 0.8.4 (owner: "when something is picked ... card should close and move down in app bringing video control up"):
// after a one-tap pick in Library or News the list folds shut and its section moves below the player.
let tucked = false;
// 0.8.5 (owner: "can auto play be there for the next video or movie in line"): the list the pick came from, and
// where in it the pick is. Double / triple tap on the glasses and the end of a video move along it.
let queue = null;          // { from: 'library' | 'news' | 'nas', items: [src], index }
let autoNext = true;       // at the end of a video, play the next one in line (Play the next one: On / Off)
let stepping = false;
const AUTONEXT_KEY = 'mmvideo.autonext';
const PCADDR_KEY = 'mmvideo.pcaddr';   // 0.8.25: the engine address he typed (phone engine http://127.0.0.1:11500 or the PC)
const ENGINE_KEY = 'mmvideo.engine';   // 0.8.26: 'auto' (phone engine first, PC if it does not answer) | 'phone' | 'pc'
let engineMode = 'auto';
let engineBase = '';                   // the engine picked last (shown under the Engine buttons)
// 0.8.46: IPTV stays on the phone (one-stream plan). On = the old way: Auto may send IPTV to the PC when the phone fails.
const IPTVPC_KEY = 'mmvideo.iptvpc';
let iptvPcOn = false;
// 0.9.0 (owner 2026-11-10: "Lets start eliminating all pc connections to the app maybe just hide them under a
// subsystem"): the PC subsystem. Off (the default) = everything runs on the phone engine, no PC fallback, no PC
// captions, no PC copy of the settings. On = the 0.8.46 Engine / IPTV / Captions-from choices count again.
const PCSUB_KEY = 'mmvideo.pcsub';
let pcOn = false;
function effMode() { return pcOn ? engineMode : 'phone'; }
function engBases() { return pcOn ? [PHONE_ENGINE, pcBase()] : [PHONE_ENGINE]; }
// 0.9.0 screens: home | live | movies | shows | search | news | nas (the bottom tab bar). Separate from pattern
// (what plays), so looking at another tab never stops the video.
let view = 'home';
const VIEW_BOX = { live: 'livebox', search: 'livebox', movies: 'libbox', shows: 'ytbox', news: 'newsbox', nas: 'nasbox' };
const VIEW_PATTERN = { live: 'live', search: 'live', movies: 'library', shows: 'youtube', news: 'news', nas: 'nas' };
// 0.9.4: with the PC subsystem Off the Movies tab IS the IPTV movie search (the film library lives on the PC), and it stays the Movies tab.
const movieSearch = () => view === 'movies' && !pcOn;
const MOVIE_HINT = '영화 이름을 입력한 뒤 검색을 누르세요.';
function liveShown() { return pattern === 'live' || view === 'live' || view === 'search' || view === 'home' || movieSearch(); }   // home has the favorites row
const chooser = new EngineChooser({ fetchFn: (url) => fetch(url, { cache: 'no-store' }), wait: (ms) => wait(ms) });
// 0.8.6 (owner: "make the glasses feel like a nostalgia tv but just while is loading"): while a video loads the
// glasses (v10) show snow + NOW SWITCHING TO CHANNEL n, and the phone plays a very quiet static hiss.
let tuneOn = true;         // Old TV snow while loading: On / Off
let hissOn = true;         // Static sound with it: On / Off (only when Sound is Phone)
const NOWBAR_KEY = 'mmvideo.nowbar';
const PADAUTO_KEY = 'mmvideo.padauto';
let padAuto = true;        // 0.8.14: the touchpad opens by itself on a small screen (the phone folded = the cover screen)
let nowbarOn = true;       // 0.8.8: the now-playing bar (title, Stop, Pick another) at the top while something plays
let tuneSent = false;      // a TUNE went to the glasses and no picture or CLEAR after it yet
const TUNE_KEY = 'mmvideo.tune';
const HISS_KEY = 'mmvideo.hiss';
// 0.8.8 (owner: "highlight brightness still look washed out on super bright images"): Settings > Bright scenes.
// Tame = very bright stills are pulled down a little and the top greys fold softly instead of clipping (yt.js TONE
// brightPull + knee); Plain = the 0.8.7 curve. Only the Normal and Dither looks go through this (Manga/Auto are made on the PC).
const BRIGHT_KEY = 'mmvideo.bright';
// 0.9.8 (owner 2026-11-11 "tame the bright scenes a bit more"): Strong is the new default (brightfix.js); Tame = 0.9.7.
let brightTame = 'strong';
tameBright(brightTame);
const hiss = new Hiss({ makeContext: () => { const C = globalThis.AudioContext || globalThis.webkitAudioContext; return C ? new C() : null; } });
// 0.8.32 ad breaks (owner: "reuse that downtime for ads ... They need to have sound", "Mixed ads ... weather etc",
// ZIP ): every switch is timed (tap -> first picture -> first sound, in the log), and when the channel is still
// not showing after 1.5 s the glasses show an ad card and the phone reads it out, until the picture comes.
// 0.8.40 (owner: "Remove ads for now leave the snow screen Until I make more ads"): paused; the snow + hiss stay.
// Set ADS_PAUSED = false (and unhide #adsrow in index.html) to bring the ad breaks back.
const ADS_PAUSED = true;
let adsOn = !ADS_PAUSED;
// 0.8.40 IPTV search state (here, above every use; the code is beside liveOfferHide)
const SKIND_WORD = { live: 'channels', movie: 'movies', series: 'shows' };
let liveSKind = 'live';
let liveSGen = 0;
let liveSHits = null;   // the last result list: Back from a show's episodes repaints it
const switchTimer = new SwitchTimer();
const adCtx = () => hiss.ctx || (hiss.ctx = hiss.makeContext());
const adSound = new AdSound({ ctx: adCtx, fetchFn: (url) => fetch(url), bases: () => engBases() });
const adVoice = { play: (clips, o) => (sound === 'phone' ? adSound.play(clips, o) : Promise.resolve(0)), stop: (o) => adSound.stop(o) };
async function adShow(ad, live) {
  const [w, h] = size;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  drawCard(g, w, h, ad.card);
  const px = g.getImageData(0, 0, w, h).data;
  const lum = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < lum.length; i += 1, j += 4) lum[i] = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8;
  const scale = pictureScale(w, h, glass?.dispW ?? 600, glass?.dispH ?? 350, glassPicture());
  const { message } = encodePacked({ seq: 0, w, h, scale, pack: 'lz4', packed: pack4(quantize(dimLum(lum), w, h), w, h) });
  if (!live()) return;   // the channel came while the card was drawn: never send it
  hiss.stop();
  tuneSent = true;       // a CLEAR still follows if no video comes
  await link.send(message);
}
// 0.8.33 video ads: the whole film on the glasses (pre-cut grey frames from the engine), its sound on the phone.
const adFilm = new AdFilm({ fetchFn: (url) => fetch(url), bases: () => engBases(), parse: parseMMV,
  preload: (name) => { if (sound === 'phone') adSound.load(name).catch(() => {}); } });
async function adFilmShow(clip, live, { from = 0, to = clip.count } = {}) {
  const [w, h] = size;
  const src = mmvSource(clip, w, h);
  const scale = pictureScale(w, h, glass?.dispW ?? 600, glass?.dispH ?? 350, glassPicture());
  let prev = null;
  let n = 0;
  let first = true;
  return playFilm(clip, { from, to, live, now: () => performance.now(), wait, send: async (i) => {
    const lum = src(i);
    if (!lum) return;
    const packed = pack4(clip.levels ? dimLum(lum) : quantize(dimLum(lum), w, h), w, h);   // 0.8.35 ads 30 % darker
    const key = !prev || !deltaok() || n % KEY_EVERY === 0;
    const { message } = encodePacked({ seq: 0, w, h, scale, pack: key ? (lz4ok() ? 'lz4' : 'raw') : 'delta', packed, prev });
    if (!live()) return;   // the channel came: never send another ad frame
    if (first) { hiss.stop(); tuneSent = true; first = false; }
    n += 1;
    try { await link.send(message); prev = packed; } catch (e) { prev = null; throw e; }
  } });
}
// 0.8.34 animated forecast (owner: "the weather needs to be better"): now (the number counts up) -> next hours ->
// tomorrow + sunset, each page slides in. Checked 5 times a second; a picture is sent only when it changes.
async function adWeatherShow(wx, live, { ms = weatherShowMs(wx) } = {}) {
  const [w, h] = size;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const scale = pictureScale(w, h, glass?.dispW ?? 600, glass?.dispH ?? 350, glassPicture());
  const t0 = performance.now();
  let lastKey = null;
  let first = true;
  for (;;) {
    const t = performance.now() - t0;
    if (!live() || t >= ms) return;
    const spec = weatherFrameSpec(wx, t);
    if (spec.key !== lastKey) {
      lastKey = spec.key;
      drawWeather(g, w, h, spec);
      const px = g.getImageData(0, 0, w, h).data;
      const lum = new Uint8Array(w * h);
      for (let i = 0, j = 0; i < lum.length; i += 1, j += 4) lum[i] = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8;
      const { message } = encodePacked({ seq: 0, w, h, scale, pack: 'lz4', packed: pack4(quantize(dimLum(lum), w, h), w, h) });
      if (!live()) return;   // the channel came: never send another ad frame
      if (first) { hiss.stop(); tuneSent = true; first = false; }
      await link.send(message);
    }
    await wait(200);
  }
}
async function adWeather() {
  for (const b of engBases()) {
    if (!b) continue;
    try {
      const r = await fetch(`${String(b).replace(/\/+$/, '')}/ad/weather`, { cache: 'no-store' });
      if (r.ok) { const w = await r.json(); if (w && w.ok) return w; }
    } catch { /* next engine */ }
  }
  return null;
}
function adGuide() {
  const chs = (tvCache?.groups || []).flatMap((g) => g.channels || []).filter((c) => c && c.name && c.now);
  return chs.length ? chs[Math.floor(Math.random() * chs.length)] : null;
}
const adBreak = new AdBreak({ wait, show: adShow, sound: adVoice, picker: new AdPicker(), weather: adWeather, guide: adGuide,
  on: () => adsOn, timer: switchTimer, log, after: (n) => log(`ads: ${n} shown while switching`), film: adFilm, showFilm: adFilmShow,
  showWeather: adWeatherShow, now: () => performance.now() });
// Called at the tap (before any await): the AudioContext is made inside the tap so the ad voice may play later.
let switchGen = 0;   // 0.8.34: a newer tap wins over an ad that is still playing out
function switchBegin(src) {
  switchGen += 1;
  if (src?.kind === 'live' && src.url && src.url !== lastCh) { lastCh = src.url; void gm.storage.set(LASTCH_KEY, lastCh).catch(() => {}); }   // 0.8.39
  if (!hiss.ctx) { try { hiss.ctx = hiss.makeContext(); } catch { /* no sound on this phone */ } }
  switchTimer.begin(src?.name || src?.title || '');
}
function switchMark(what) {
  if (switchTimer.mark(what) == null) return;
  const s = switchTimer.summary();
  if (s) log(s);
}
let listOpen = true;       // while tucked: the list is shown again with the "Show the list" button

const isVideo = () => pattern === 'youtube' || pattern === 'nas' || pattern === 'library' || pattern === 'news' || pattern === 'live';
const isLive = () => !!(ytReady && yt.info?.live);

// 0.8.7 Live: a line-up of free 24/7 news streams. The PC (ytcast 0.7.0) decodes the stream as it comes and
// never ends it; the glasses switch between them like channels. Any of these can go off the air: a card that
// fails just says so. (Owner 2026-11-06: "any free way to get live tv in low stream" — news first, Classics later.)
// 0.8.9 (owner 2026-11-06: "15-20 mixed channels", "more free channels entertainment cartoons etc", "Yes add Spanish"):
// 33 channels in groups. Every one is an official free stream (probed one by one on 2026-11-06, see MIND.md);
// no DRM services (his call). YouTube lives need ytcast 0.7.2 (video + sound come as two streams now).
const YT = 'https://www.youtube.com/';
const LIVE_CHANNELS = [
  { group: '한국 무료 방송', name: 'YTN', url: `${YT}user/ytnnews24/live`, note: '공식 YouTube 생방송' },
  { group: '한국 무료 방송', name: '아리랑TV Korea', url: `${YT}watch?v=xl-F3dEqACw`, note: '공식 YouTube 생방송' },
  { group: 'News', name: 'CBS News', url: 'https://www.cbsnews.com/live/', note: 'national, 24/7' },
  { group: 'News', name: 'CBS News Bay Area', url: 'https://www.cbsnews.com/sanfrancisco/live/', note: 'San Francisco, 24/7' },
  { group: 'News', name: 'NBC News NOW', url: `${YT}@NBCNews/live`, note: 'YouTube live' },
  { group: 'News', name: 'ABC News Live', url: `${YT}@ABCNews/live`, note: 'YouTube live' },
  { group: 'News', name: 'Bloomberg TV', url: `${YT}@markets/live`, note: 'YouTube live, business' },
  { group: 'News', name: 'Sky News', url: `${YT}@SkyNews/live`, note: 'YouTube live, UK' },
  { group: 'News', name: 'DW News', url: `${YT}@dwnews/live`, note: 'YouTube live, Germany' },
  { group: 'News', name: 'France 24 English', url: `${YT}@France24_en/live`, note: 'YouTube live, France' },
  { group: 'News', name: 'Euronews', url: `${YT}@euronews/live`, note: 'YouTube live, Europe' },
  { group: 'News', name: 'Al Jazeera English', url: `${YT}@aljazeeraenglish/live`, note: 'YouTube live' },
  { group: 'Weather and space', name: 'FOX Weather', url: `${YT}@foxweather/live`, note: 'YouTube live, 24/7' },
  { group: 'Weather and space', name: 'NASA', url: `${YT}@NASA/live`, note: 'YouTube live' },
  { group: 'Weather and space', name: 'NASA TV', url: 'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8', note: 'direct stream, 24/7' },
  { group: 'Sport', name: 'Red Bull TV', url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8', note: 'direct stream, 24/7' },
  { group: 'Music', name: 'Lofi Girl', url: `${YT}@LofiGirl/live`, note: 'YouTube live, beats to relax' },
  { group: 'Music', name: 'Lofi Girl synthwave', url: `${YT}watch?v=4xDzrJKXOOY`, note: 'YouTube live, synthwave' },
  { group: 'Español', name: 'DW Español', url: `${YT}@dwespanol/live`, note: 'YouTube live, noticias' },
  { group: 'Español', name: 'France 24 Español', url: `${YT}@France24_es/live`, note: 'YouTube live, noticias' },
  { group: 'Español', name: 'Euronews Español', url: `${YT}@euronewses/live`, note: 'YouTube live, noticias' },
  { group: 'Cartoons', name: 'Mr Bean', url: `${YT}@MrBean/live`, note: 'YouTube live' },
  { group: 'Cartoons', name: 'Peppa Pig', url: `${YT}@PeppaPigOfficial/live`, note: 'YouTube live' },
  { group: 'Cartoons', name: 'Pocoyo', url: `${YT}@Pocoyo/live`, note: 'YouTube live, often in Spanish' },
  { group: 'Cartoons', name: 'Masha and the Bear', url: `${YT}@MashaBearEN/live`, note: 'YouTube live' },
  { group: 'Cartoons', name: 'Oggy and the Cockroaches', url: `${YT}@OGGY/live`, note: 'YouTube live' },
  { group: 'Cartoons', name: 'Zig and Sharko', url: `${YT}@ZigandSharko/live`, note: 'YouTube live' },
  { group: 'Cartoons', name: 'Larva', url: `${YT}@LarvaTUBA/live`, note: 'YouTube live' },
  { group: 'Cartoons', name: 'Talking Tom', url: `${YT}@TalkingTom/live`, note: 'YouTube live' },
  { group: 'Cartoons', name: 'Pinkfong Baby Shark', url: `${YT}@Pinkfong/live`, note: 'YouTube live, little kids' },
  { group: 'Comedy', name: 'MST3K', url: `${YT}@MST3K/live`, note: 'YouTube live, Mystery Science Theater' },
  { group: 'Comedy', name: 'Dry Bar Comedy', url: `${YT}@DryBarComedy/live`, note: 'YouTube live, stand-up' },
  { group: 'Nature', name: 'Explore nature cams', url: `${YT}@exploreLiveNatureCams/live`, note: 'YouTube live, animals' },
  { group: 'Nature', name: 'Monterey Bay Aquarium', url: `${YT}@MontereyBayAquarium/live`, note: 'YouTube live, fish' },
];
// 0.8.9 "Tap = next channel" (owner: "Makes the app feel more like a tv"): while a Live channel plays, one tap on the
// glasses goes to the next channel, two taps to the one before, three to the last watched (0.8.38; was stop). Off = the usual play / pause / next / back.
const TAPNEXT_KEY = 'mmvideo.tapnext';
let tapNextOn = true;
// 0.9.5 "Get next and previous ready" (warm.js): on = the engine keeps the next and previous Live channel running.
let warmOn = true;
// 0.9.7 "Smooth channel switch" (switchfix.js): on = the last picture stays during a switch and live sound that drops is asked for again.
let switchFixOn = true;
let warmAsked = [];    // the urls last sent to /warm
let warmGot = [];      // the ones the engine said already give stills (a switch to these skips the snow)
// 0.8.9 "Screensaver" (owner: "a small screen saver instead of ready"): glasses v11 bounce a small MM TV badge when
// idle instead of the READY word. Off = the READY word, exactly as v10. Old glasses ignore the message.
// 0.9.2 (owner 2026-11-10: "Drop it"): Off by default, so the glasses show READY. A new key, so an old stored On
// from the default does not bring the badge back; only a tap on On after 0.9.2 does.
const SAVER_KEY = 'mmvideo.saver2';
let saverOn = false;
// 0.8.10 "TV guide from the PC" (owner: "Add tubi and Pluto and whatever you think make it a tv app"): the Live tab
// shows the PC's guide (Tunarr on the NAS, Pluto TV, Tubi; ytcast 0.7.3) in groups, with the phone as the remote.
// Nothing new goes to the glasses. Off = only the phone's own channel list, as 0.8.9.
const TVGUIDE_KEY = 'mmvideo.tvguide';
let tvGuideOn = true;
// 0.8.18 IPTV (owner: "This is my iptv login can we use this? ... Go build it and add my username and password i dont
// want to login each time"): the PC (ytcast 0.7.4) keeps his login and lists his IPTV groups in the same guide (src
// 'xc'); this switch only shows or hides them on the phone. Nothing new goes to the glasses.
const IPTV_KEY = 'mmvideo.iptv';
let iptvOn = true;
// 0.9.9 Free first (freefirst.js): an IPTV favorite with a free twin plays the free one, so the phone leaves the
// IPTV stream to the home box. Off = the 0.9.8 Favorites line.
let freeFirstOn = true;
// 0.9.10 Phone sound player (nativesound.js): phone engine sound plays in Media Link, not as a copy in the page.
let nativeOn = true;
let tvCache = null;         // { at, groups, pending, notes } from the PC, kept in gm.storage so the list paints at once
let tvGroup = '';           // key of the group on show
let tvPcDown = false;
let tvFetching = false;
// 0.8.11 (owner: "Some channels dont work allow me to turn them off in app"): ids of channels turned off. They
// vanish from the cards, the phone remote and the glasses taps. Edit on the Live tab = tap a card to hide it; a
// channel that fails to load offers "Hide <name>"; Settings > Hidden channels > Show all brings them all back.
let hidden = [];
// 0.8.12 Favorites (owner: "Add favorites to bottom of touchpad and allow me to set them"): a strip of quick-tune buttons
// right under the remote row; set in Edit mode with the star on each card. Tuning from the strip makes the favorites the
// line the remote and the glasses taps step through. Kept on the phone (gm.storage), nothing new on the glasses.
let favs = [];
let liveEditing = false;
// 0.8.11 "CRT look" (owner: "If we added a crt look to avoid the pixelated look would it work?"): glasses v12 dim
// the last screen row of every source row (scanlines), so the blocks read as TV lines. Default Off until he sees
// it. Old glasses never get the message (HELLO version < 12).
const CRT_KEY = 'mmvideo.crt';
let crtOn = true;          // 0.8.15: his pick (crt on); the glasses learn it at HELLO (crtSend)
// 0.8.21 "Glasses brightness" (owner: "Anyway to give me brightness control from within the app?"): glasses v13 set
// the display level 1..10 with auto-brightness held off while MM Video runs; 0 = Auto (default: nothing changes until
// he picks a number). The glasses put the old level back on Auto or when MM Video stops. Old glasses: never sent.
const GLOW_KEY = 'mmvideo.glow';
let glow = 0;
let glowNote = '';
// 0.8.23 "Caption letters" (owner: "Can we add other fonts?"): glasses v15 draw captions in Classic (as before),
// Clean or Large. Default Classic. Older glasses keep Classic and the 50-letter lines.
const CAPFONT_KEY = 'mmvideo.capfont';
let capFont = 0;
let capFontNote = '';
// 0.8.44 Captions fit the picture (default on; off = as 0.8.43): core.js capFit.
const CAPFIT_KEY = 'mmvideo.capfit';
let capFitOn = true;
// 0.8.45 Keep the screen on while playing (default on; off = as 0.8.44). A hidden page is throttled and loses its sound.
const AWAKE_KEY = 'mmvideo.awake';
let awakeOn = true;
const awake = makeAwake({ nav: navigator, doc: document, log: (t) => log(t) });
const CAPFONT_HINTS = ['기본은 기존의 각진 글꼴입니다.', '깔끔하게는 얇고 부드러운 글꼴로 한 줄에 더 많이 표시합니다.', '큰 글씨는 자막을 크게 표시합니다.'];
// 0.8.23 "Picture style": one easy choice over two older switches (my wording, his plan): Sharp = CRT look off + snow off,
// Smooth = CRT look on + snow off, Retro TV = CRT look on + old TV snow while loading. Other mixes = none pressed.
function pictureStyle() { return !crtOn && !tuneOn ? 'sharp' : crtOn && !tuneOn ? 'smooth' : crtOn && tuneOn ? 'retro' : ''; }
// 0.8.11 "Softer whites" (owner: "the whites looking so washed out"): yt.js caps the brightest grey two steps lower
// (less glare on big white areas). Default On; Off = exactly 0.8.10.
const SOFTWHITES_KEY = 'mmvideo.softwhites';
let softWhitesOn = true;
softWhites(true);
// 0.8.36 "Smoothing" (owner 2026-11-09: "make my 200x112 look amazing on all modes"): glasses v16 blow the picture up
// with in-between greys instead of square blocks. Default Smooth (the glasses start that way too); Blocks = as v15.
// Sent at HELLO and on a change, only to glasses that said version 16 or newer.
const SMOOTH_KEY = 'mmvideo.smooth';
let smoothOn = true;
// 0.8.36 "Dark scenes" (same go): yt.js lifts the dim greys of a dark scene before the contrast; true black stays
// black, bright scenes are untouched, the change eases in over about a second. Off = exactly 0.8.35.
const SHADOW_KEY = 'mmvideo.shadow';
const SHADOW_LEVELS = ['off', 'normal', 'strong'];
let shadowLevel = 'normal';
shadowLift(shadowLevel);
const GRAIN_KEY = 'mmvideo.grain';   // 0.8.37 grain filter (yt.js play denoise), default on
let grainOn = true;
// 0.8.41 (owner 2026-11-09: "Do everything to gain more speed while maintaining quality ... people like bigger images ...
// consider busy scenes"). Each one is a setting so it can be turned off:
//  Busy scenes: 'speed' = a delta is kept under BUSY_BUDGET bytes and a keyframe comes every BUSY_KEY_EVERY pictures
//    (bench: busiest clip 4.2 -> 5.4 fps); 'detail' = every change sent, keyframe every 15, exactly as 0.8.40.
//  Pictures in flight: 1 (default, as before) or 2 (+50% fps in the bench; two sends at once has crashed the glasses before).
//  Fill the screen: glasses v17 draw a Full picture as big as the screen with its shape kept (240x135 -> 600x337).
const BUSY_KEY = 'mmvideo.busy';
let busyMode = 'speed';
const FLIGHT_KEY = 'mmvideo.flight';
let flightN = 1;
const FIT_KEY = 'mmvideo.fit';
let fitOn = true;
// 0.8.42 Scene cuts: a fresh picture when the shot changes (core.js isSceneCut); off = deltas as in 0.8.41.
const CUT_KEY = 'mmvideo.scenecut';
let cutOn = true;
// 0.8.39 "Start on open" (owner 2026-11-09: "When the app open should start playing channels from my favorites"):
// once per page start, as soon as the glasses said HELLO and an engine is picked, the Live tab opens and a favorite
// plays: the channel he watched last if it is a favorite, else the first favorite. The favorites are the line, so
// the taps and Channel ◀ ▶ go favorite to favorite. Not if he already picked something, and not later than
// OPENFAV_WINDOW_MS after the page opened (glasses that connect much later do not start a channel by surprise).
const OPENFAV_KEY = 'mmvideo.openfav';
const LASTCH_KEY = 'mmvideo.lastch';   // id of the last live channel that played
const OPENFAV_WINDOW_MS = 60000;
let openFav = true;
let openFavDone = false, openFavLoaded = false, engineReady = false;
let lastCh = '';
const pageStart = Date.now();
function openFavPick(line, last) { if (!line.length) return -1; const i = line.findIndex((c) => c.url === last); return i >= 0 ? i : 0; }
function openFavTry() {
  if (openFavDone || !openFavLoaded || !glass || !engineReady) return;
  openFavDone = true;
  if (!openFav) return;
  if (busy || ytLoading || queue) return;   // he already picked something
  if (Date.now() - pageStart > OPENFAV_WINDOW_MS) { log('start on open: the glasses came too late, nothing started'); return; }
  const line = lineOf(favLine(liveSel()));
  const at = openFavPick(line, lastCh);
  if (at < 0) { log('start on open: no favorites yet (Live > Edit > ☆ on a channel)'); return; }
  log(`start on open: ${line[at].name} (favorite ${at + 1} of ${line.length})`);
  pattern = 'live'; tuck(false); liveOpen(); paintChoices();
  void playFrom('live', line, at).then(() => { if (queue?.from === 'live') queue.fav = true; });
}

// These glasses advertise LZ4 and delta in HELLO. Before HELLO we are optimistic (a v2 plugin has both);
// once HELLO is in we honour exactly what the glasses said.
const lz4ok = () => !(glass && !glass.lz4);
const deltaok = () => !(glass && !glass.delta);
// SK (enc 3) is new in glasses v4: unlike LZ4/Delta, only offered once HELLO says so (a v3 plugin would refuse it).
const skok = () => !!(glass && glass.sk);
function clampPack() {
  if (pack === 'lz4' && !lz4ok()) pack = 'raw';
  if (pack === 'delta' && !deltaok()) pack = lz4ok() ? 'lz4' : 'raw';
  if ((pack === 'sk' || pack === 'sk2') && !skok() && glass) pack = deltaok() ? 'delta' : lz4ok() ? 'lz4' : 'raw';
}

// Clip = a video PRECONVERTED on the PC into a .mmv grey-frame file (see core.js parseMMV / tools/clip2frames.py).
// The phone does NO video decoding — its WebView reads a hardware <video> as solid black and has no WebCodecs
// (both proven on this phone, v0.1.1/v0.1.2). So the PC decodes with ffmpeg; the phone just reads the baked
// frames and streams them exactly like a generated pattern (mmvSource -> Streamer).

const packLabel = (p) => (p === 'raw' ? 'raw' : p === 'delta' ? 'Delta' : p === 'sk' ? 'SK' : p === 'sk2' ? 'SK 4-grey' : 'LZ4');
const clockText = (s) => {
  const t = Math.max(0, Math.floor(s)); const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(t % 60).padStart(2, '0')}`;
};
const sizeText = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);

// 0.9.1 (owner: "the glasses ready could be an icon"): a glasses icon with a dot (green ready, grey connecting,
// red not answering); the words stay for screen readers and the title, a tap shows them for a moment.
function setStatus(text, ok) {
  const el = $('link'); const sr = el.querySelector('.sr');
  if (sr) sr.textContent = text; else el.textContent = text;
  el.title = text;
  el.classList.toggle('ok', !!ok); el.classList.toggle('bad', !ok && /not answering/.test(text));
}
// 0.9.3 (owner: "Anything that's on or of make it a switch"): a switch keeps data-on / data-off; its data-<key> holds what a
// tap sends, so every old click handler works unchanged.
function pressed(selector, test) {
  for (const b of document.querySelectorAll(selector)) {
    if (b.getAttribute('role') !== 'switch') { b.setAttribute('aria-pressed', String(test(b))); continue; }
    const key = (/^\[data-([a-z0-9]+)\]$/.exec(selector) || [])[1]; if (!key) continue;
    b.dataset[key] = b.dataset.on; const isOn = !!test(b);
    b.setAttribute('aria-checked', String(isOn)); b.dataset[key] = isOn ? b.dataset.off : b.dataset.on;
  }
}
function showPos() {
  if (isLive()) { $('pos').textContent = busy ? '실시간' : '실시간 · 재생을 누르세요'; return; }
  const at = busy && isVideo() ? lastPos : startAt;
  const total = ytReady && yt.info?.duration ? ` / ${clockText(yt.info.duration)}` : '';
  $('pos').textContent = `${clockText(at)}${total}`;
}
function paintChoices() {
  pressed('[data-size]', (b) => b.dataset.size === `${size[0]}x${size[1]}`);
  pressed('[data-pattern]', (b) => b.dataset.pattern === pattern);
  clampPack();
  pressed('[data-pack]', (b) => b.dataset.pack === pack);
  for (const b of document.querySelectorAll('[data-pack="lz4"]')) b.disabled = !lz4ok();
  for (const b of document.querySelectorAll('[data-pack="delta"]')) b.disabled = !deltaok();
  for (const b of document.querySelectorAll('[data-pack="sk"], [data-pack="sk2"]')) b.disabled = !skok();
  $('cliprow').hidden = pattern !== 'clip';
  $('clipnote').textContent = pattern !== 'clip' ? ''
    : clipReady ? `Streaming ${clipName}`
      : clipName ? `Loading ${clipName}…`
        : 'Pick a .mmv clip (made on the PC: py tools/clip2frames.py <video> clip.mmv). The phone never decodes video.';
  $('lz4note').textContent = glass && !glass.lz4 ? '이 안경은 LZ4를 지원하지 않아 압축 없이 전송합니다.'
    : glass && !glass.delta ? 'These glasses are an older build: no Delta.'
    : !glass ? 'SK waits for the glasses to answer.'
    : !glass.sk ? 'These glasses are an older build: no SK (install glasses v4).'
    : pack === 'sk2' ? 'SK 4-grey: about half the bytes of SK, only 4 greys.' : '';
  for (const id of ['ytbox', 'nasbox', 'libbox', 'newsbox', 'livebox']) $(id).hidden = (movieSearch() ? 'livebox' : VIEW_BOX[view]) !== id;   // 0.9.0: the tab on show
  $('homeview').hidden = view !== 'home';
  $('srcsec').hidden = view === 'home';
  document.body.dataset.view = view;   // 0.9.0: CSS hides an idle player off Home
  document.body.classList.toggle('searchonly', view === 'search' || movieSearch());
  document.body.classList.toggle('moviesearch', movieSearch());   // 0.9.4: hides the Channels / Movies / Shows chips
  { const q = $('livesq'); const note = $('livesnote'); const ms = movieSearch();
    q.placeholder = ms ? '영화 이름으로 검색' : 'IPTV 이름으로 검색';
    if (ms && !String(q.value || '').trim() && !liveSHits) { note.hidden = false; note.textContent = MOVIE_HINT; }
    else if (note.textContent === MOVIE_HINT) { note.hidden = true; note.textContent = ''; } }
  document.body.classList.toggle('pcoff', !pcOn);
  pressed('[data-view]', (b) => b.dataset.view === view || (view === 'news' && b.dataset.view === 'home') || (view === 'nas' && b.dataset.view === 'home'));
  pressed('[data-pcsub]', (b) => (b.dataset.pcsub === 'on') === pcOn);
  $('playsec').classList.toggle('idle', !ytReady && !busy && !ytLoading);
  $('playsec').classList.toggle('testpat', !isVideo());   // 0.9.4: an idle video player hides its play button; a test pattern keeps it
  $('herotitle').textContent = busy ? (isLive() ? `실시간 · ${yt.info?.title || pickName(loaded)}` : yt.info?.title || pickName(loaded))
    : ytLoading ? `Loading ${pickName(loaded) || '…'}` : ytReady ? (yt.info?.title || pickName(loaded)) : '재생 중인 콘텐츠 없음';
  $('liblist').hidden = tucked && !listOpen;
  $('newslist').hidden = tucked && !listOpen;
  $('showlist').hidden = tucked && !listOpen;
  $('livelist').hidden = tucked && !listOpen;
  for (const id of ['libshow', 'newsshow', 'liveshow']) { $(id).hidden = !tucked; $(id).textContent = listOpen ? '목록 숨기기' : '목록 표시'; }
  $('playbox').hidden = !isVideo();
  $('ytnote').hidden = !isVideo();
  pressed('[data-sound]', (b) => b.dataset.sound === sound);
  pressed('[data-look]', (b) => b.dataset.look === look);
  pressed('[data-picture]', (b) => b.dataset.picture === picture);
  pressed('[data-captions]', (b) => (b.dataset.captions === 'on') === captionsOn);
  pressed('[data-aicap]', (b) => (b.dataset.aicap === 'on') === aiCaps);
  pressed('[data-cappc]', (b) => (b.dataset.cappc === 'pc') === capPcOn);
  pressed('[data-autonext]', (b) => (b.dataset.autonext === 'on') === autoNext);
  pressed('[data-openfav]', (b) => (b.dataset.openfav === 'on') === openFav);
  pressed('[data-tune]', (b) => (b.dataset.tune === 'on') === tuneOn);
  pressed('[data-hiss]', (b) => (b.dataset.hiss === 'on') === hissOn);
  pressed('[data-ads]', (b) => (b.dataset.ads === 'on') === adsOn);
  pressed('[data-skind]', (b) => b.dataset.skind === liveSKind);   // 0.8.40 IPTV search: Channels / Movies / Shows
  pressed('[data-bright]', (b) => brightLevel(b.dataset.bright) === brightLevel(brightTame === true ? 'tame' : brightTame));
  pressed('[data-engine]', (b) => b.dataset.engine === engineMode);
  $('enginenote').textContent = engineNote();
  $('ytload').disabled = busy || ytLoading;
  label('ytload', ytLoading ? 'Loading…' : ytReady && loaded?.kind === 'youtube' ? 'Load again' : 'Load video');
  $('nasup').disabled = nasParent === null;
  for (const b of document.querySelectorAll('#naslist button, #liblist button, #newslist button, #showlist button, #livelist button, #livefavs button, #padfavs button, #homefavs button')) b.disabled = ytLoading;   // 0.8.8: a tap while playing stops and switches
  for (const b of document.querySelectorAll('#livesres button')) b.disabled = ytLoading;   // 0.8.40 search results
  pressed('[data-nowbar]', (b) => (b.dataset.nowbar === 'on') === nowbarOn);
  pressed('[data-show]', (b) => b.dataset.show === showKey);
  pressed('[data-padauto]', (b) => (b.dataset.padauto === 'on') === padAuto);
  pressed('[data-tapnext]', (b) => (b.dataset.tapnext === 'on') === tapNextOn);
  pressed('[data-warm]', (b) => (b.dataset.warm === 'on') === warmOn);
  pressed('[data-switchfix]', (b) => (b.dataset.switchfix === 'on') === switchFixOn);
  pressed('[data-tvguide]', (b) => (b.dataset.tvguide === 'on') === tvGuideOn);
  pressed('[data-iptv]', (b) => (b.dataset.iptv === 'on') === iptvOn);
  pressed('[data-freefirst]', (b) => (b.dataset.freefirst === 'on') === freeFirstOn);
  pressed('[data-nativesound]', (b) => (b.dataset.nativesound === 'on') === nativeOn);
  if (liveShown()) liveMark();
  pressed('[data-saver]', (b) => (b.dataset.saver === 'on') === saverOn);
  pressed('[data-covers]', (b) => (b.dataset.covers === 'on') === coversOn);
  pressed('[data-holdfav]', (b) => (b.dataset.holdfav === 'on') === holdFavOn);
  pressed('[data-ytchans]', (b) => (b.dataset.ytchans === 'on') === ytChansOn);
  paintTiles();
  pressed('[data-crt]', (b) => (b.dataset.crt === 'on') === crtOn);
  $('glowslider').value = String(glow);   // 0.9.3: a slider (0 = Auto)
  $('glowinfo').textContent = glowNote || (glow ? `Level ${glow}.` : 'Auto.');
  pressed('[data-capfont]', (b) => Number(b.dataset.capfont) === capFont);
  $('capfontinfo').textContent = capFontNote || CAPFONT_HINTS[capFont];
  pressed('[data-capfit]', (b) => (b.dataset.capfit === 'on') === capFitOn);
  pressed('[data-awake]', (b) => (b.dataset.awake === 'on') === awakeOn);
  pressed('[data-iptvpc]', (b) => (b.dataset.iptvpc === 'on') === iptvPcOn);
  pressed('[data-pic]', (b) => b.dataset.pic === pictureStyle());
  pressed('[data-softwhites]', (b) => (b.dataset.softwhites === 'on') === softWhitesOn);
  pressed('[data-smooth]', (b) => (b.dataset.smooth === 'on') === smoothOn);
  pressed('[data-shadow]', (b) => b.dataset.shadow === shadowLevel);
  pressed('[data-grain]', (b) => (b.dataset.grain === 'on') === grainOn);
  pressed('[data-busy]', (b) => b.dataset.busy === busyMode);
  pressed('[data-flight]', (b) => Number(b.dataset.flight) === flightN);
  pressed('[data-fit]', (b) => (b.dataset.fit === 'on') === fitOn);
  pressed('[data-scenecut]', (b) => (b.dataset.scenecut === 'on') === cutOn);
  $('hiddencount').textContent = hidden.length ? `${hidden.length} hidden channel${hidden.length === 1 ? '' : 's'}.` : '숨긴 채널이 없습니다.';
  $('unhide').disabled = !hidden.length;
  label('liveedit', liveEditing ? 'Done' : 'Edit', liveEditing ? 'check' : 'pencil');
  $('liveedit').setAttribute('aria-pressed', String(liveEditing));
  $('nowbar').hidden = !(nowbarOn && busy && isVideo());   // only while something really plays (a load has its own notes)
  $('nowtitle').textContent = isLive() ? `실시간 · ${yt.info?.title || pickName(loaded)}` : `재생 중 · ${yt.info?.title || pickName(loaded)}`;
  for (const b of document.querySelectorAll('[data-jump]')) b.disabled = !ytReady || isLive();   // a live stream has no "back 5 minutes"
  $('jumpgo').disabled = !ytReady || isLive();
  label('start', busy ? 'Stop' : 'Start', busy ? 'square' : 'play');
  $('runall').disabled = busy || isVideo();
  showPos();
}

function preview(w, h, n) {
  const canvas = $('preview'); const ctx = canvas.getContext('2d');
  canvas.width = w; canvas.height = h;
  let levels;
  if (isVideo()) {
    if (!lastLum || lastLum.length !== w * h) { ctx.clearRect(0, 0, w, h); return; }
    levels = levelsFor(lastLum, w, h, lastLook);
  } else if (pattern === 'clip') {
    if (!clipReady || !clipFrames) { ctx.clearRect(0, 0, w, h); return; }
    const lum = mmvSource(clipFrames, w, h)(n % clipFrames.count);
    if (!lum) return;
    // ver=2 clips are already 0..15 levels (PC error-diffusion dither); ver=1 is 0..255 brightness.
    levels = clipFrames.levels ? lum : quantize(lum, w, h);
  } else {
    levels = quantize(renderPattern(pattern, w, h, n), w, h);
  }
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < levels.length; i += 1) { const v = levels[i] * 17; img.data.set([0, v, Math.round(v * 0.45), 255], i * 4); }
  ctx.putImageData(img, 0, 0);
}

function showLive(info) {
  const now = clock();
  switchMark('picture');   // 0.8.32: the first picture of a switch
  if (info.lum) { lastLum = info.lum; lastLook = info.look || 'normal'; }
  if (now - lastPreview > 250) { lastPreview = now; preview(info.w, info.h, info.n); }
  if (info.pos !== undefined) {
    lastPos = info.pos; showPos();
    $('capline').textContent = capTrack.textAt(info.pos);
  }
  $('phonefps').textContent = `#${info.n}  last send ${info.ack === undefined ? '-' : Math.round(info.ack)} ms  ${info.bytes} B  enc ${info.enc}`;
}
function showGlass() {
  $('glassfps').textContent = glassStats
    ? `${glassStats.fps.toFixed(1)} fps drawn  (${glassStats.drawn} drawn / ${glassStats.received} got, ${glassStats.refused} refused, draw ${glassStats.drawMs} ms)`
    : 'no report yet';
}

function row(r) {
  const tr = document.createElement('tr');
  for (const v of [r.size, r.pattern, packLabel(r.pack), r.bytesAvg, r.fps, r.glassFps ?? '-', r.ackMed, r.ackMax, r.kbps]) {
    const td = document.createElement('td'); td.textContent = String(v); tr.append(td);
  }
  return tr;
}
function paintResults() {
  const body = $('results'); body.replaceChildren(...results.map(row));
  $('resultsbox').hidden = results.length === 0;
}

async function runOne(step, playWhole = false) {
  glassStats = null;
  // Clip = the preconverted .mmv frames. mmvSource returns null past the last frame.
  // playWhole (the Start button): play the clip once to its end (replay=false, no 10 s cap) so you can
  // WATCH the whole video. Otherwise (Run all sizes, or a pattern): the Streamer loops for a 10 s sample.
  const isClip = step.pattern === 'clip';
  const source = isClip ? mmvSource(clipFrames, step.w, step.h) : null;
  const whole = isClip && playWhole && clipFrames;
  if (whole) {
    const vs = (clipFrames.count / Math.max(1, clipFrames.fps)).toFixed(0);
    log(`playing whole clip: ${clipFrames.count} frames (${vs}s of video) — sends slower than real time, so it runs longer. Tap Start again to stop.`);
  }
  const r = await streamer.run({
    w: step.w, h: step.h, pattern: step.pattern, pack: step.pack, source,
    durationMs: whole ? 3600000 : RUN_MS, replay: !whole,
    dispW: glass?.dispW ?? 600, dispH: glass?.dispH ?? 350, onFrame: showLive, picture: glassPicture(),
    // ver=2 clip frames are pre-dithered 0..15, so the Streamer must NOT re-quantize them.
    levels: isClip ? !!clipFrames?.levels : false,
  });
  r.glassFps = glassStats ? glassStats.fps : null;
  r.glassDrawn = glassStats ? glassStats.drawn : null;
  r.at = new Date().toISOString();
  results.unshift(r); results = results.slice(0, 40);
  paintResults();
  void gm.storage.set(RESULTS_KEY, results).catch((e) => log(`save: ${e?.message ?? e}`));
  log(`${r.size} ${r.pattern} ${packLabel(r.pack)}: ${r.fps} fps sent, glasses ${r.glassFps ?? '?'} fps, send ${r.ackMed} ms median, ${r.bytesAvg} B/frame`);
  return r;
}

async function guarded(work) {
  if (busy) return;
  busy = true; stopAsked = false; paintChoices();
  void awake.playing(true);
  try { await work(); } catch (e) { log(`stopped: ${e?.code ?? e?.message ?? e}`); }
  busy = false; paintChoices();
  void awake.playing(false);
  if (keepPicture(switchFixOn, stepping)) tuneSent = true;   // 0.9.7: a switch keeps the last picture (no READY); tuneOff clears if it fails
  else { try { await link.send(CLEAR); } catch { /* glasses gone */ } }
  capTrack.reset();
}

// The MemoMind app refuses an HTML <input type="file"> ("Web capability unavailable: use gm.files.pick()").
// So the Clip picker goes through the App SDK: pick -> openRead (a byte stream) -> the .mmv bytes.
// Needs only the files.user-selected permission (no video decode anymore — the PC did that).
const filesApi = () => (gm.files && typeof gm.files.pick === 'function') ? gm.files : null;

async function readPicked(fileId) {
  const opened = await filesApi().openRead(fileId);
  const reader = opened.stream.getReader();
  const chunks = []; let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value); total += value.length;
    }
  } finally { reader.releaseLock(); }
  const buf = new Uint8Array(total); let at = 0;
  for (const c of chunks) { buf.set(c, at); at += c.length; }
  return buf;
}

async function loadPicked(desc) {
  if (!desc) return;
  clipReady = false; clipFrames = null; clipName = desc.name || 'clip'; paintChoices();
  try {
    let bytes = await readPicked(desc.fileId);
    // A zstd file starts with magic 28 B5 2F FD (clip2frames.py --zstd). Decompress to the raw .mmv first.
    if (bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xB5 && bytes[2] === 0x2F && bytes[3] === 0xFD) {
      const packed = bytes.length;
      bytes = zstdDecompress(bytes);
      log(`decompressed zstd clip: ${packed} -> ${bytes.length} bytes`);
    }
    const clip = parseMMV(bytes);           // throws if it isn't a preconverted .mmv
    clipFrames = clip; clipReady = true;
    log(`clip ready: ${clipName} (${clip.w}x${clip.h}, ${clip.count} frames @ ${clip.fps} fps${clip.levels ? ', pre-dithered' : ''})`);
    paintChoices(); preview(size[0], size[1], 0);
  } catch (e) {
    clipReady = false; clipFrames = null;
    log(`Not a preconverted clip: ${e?.message ?? e}. Convert a video on the PC first: py tools/clip2frames.py <video> clip.mmv`);
    paintChoices();
  }
}

async function pickClip() {
  const fs = filesApi();
  if (!fs) { log('This app build has no file picker (needs the files.user-selected permission).'); return; }
  try {
    const { files } = await fs.pick({ extensions: ['mmv', 'bin'], allowMultiple: false });
    if (!files || !files.length) { log('No file picked.'); return; }
    await loadPicked(files[0]);
  } catch (e) { log(`pick: ${e?.code ?? e?.message ?? e}`); }
}

// Full needs glasses that offer it (HELLO flags bit4, version 7); older glasses would refuse every frame, so they get Big.
function glassPicture() { return picture === 'full' && !glass?.full ? 'big' : picture; }

// 0.8.26: the engine. A video that is loading or playing keeps its engine (its stills and sound live there). A
// switch while one is only loaded (Ready) drops it: Start would ask the wrong engine. usePc() = the last pick,
// useEngine() asks the phone first.
function pcBase() { return pcFallback(cleanBase($('ytpc').value), DEFAULT_PC); }
function videoHeld() { return yt.running || ytLoading; }
function usePc() {
  if (!engineBase) engineBase = effMode() === 'phone' ? PHONE_ENGINE : pcBase();
  if (!videoHeld()) yt.base = engineBase;
  return yt.base;
}
async function useEngine(need = '', iptv = false) {
  if (videoHeld()) return yt.base;
  let b;
  if (iptv) {   // 0.8.46: IPTV = the phone engine unless Engine is PC (or "IPTV may use the PC" is On)
    let up = true;
    if (effMode() === 'auto' && pcOn && iptvPcOn) { try { up = await chooser.phoneUp(); } catch { up = false; } }
    b = iptvEngine(effMode(), up, pcBase(), pcOn && iptvPcOn);
  } else {
    try { b = await chooser.choose(effMode(), pcBase(), need); } catch { b = pcOn ? pcBase() : PHONE_ENGINE; }
  }
  if (videoHeld()) return yt.base;   // a load started while we asked
  if (b !== engineBase) log(`engine: ${b === PHONE_ENGINE ? 'phone' : 'PC'} (${b})`);
  engineBase = b;
  if (yt.base !== b && ytReady) { ytReady = false; $('ytnote').textContent = `Switched to ${engineWho(b)}: load the video again.`; }
  yt.base = b;
  paintChoices();
  return b;
}
function engineWho(b = yt.base) { return b === PHONE_ENGINE ? 'the phone engine' : 'the PC'; }
// 0.8.27 (owner: "Everything says of the pc first not the phone?"): status words name the engine in use.
function EngineWho(b = yt.base) { const w = engineWho(b); return w[0].toUpperCase() + w.slice(1); }
function engineTag(b = yt.base) { return b === PHONE_ENGINE ? 'Phone' : 'PC'; }
function engineNote() {
  const now = engineBase ? (engineBase === PHONE_ENGINE ? '휴대폰 엔진을 사용 중입니다.' : 'PC 엔진을 사용 중입니다.') : '';
  if (!pcOn) return `${now} PC 연동이 꺼져 있어 휴대폰에서 실행합니다.`.trim();
  const how = engineMode === 'auto' ? '자동은 휴대폰 Termux 엔진을 우선 사용하고, 사용할 수 없으면 PC 엔진을 사용합니다. 휴대폰에 NAS가 없으면 PC를 사용합니다.'
    : engineMode === 'phone' ? '휴대폰 엔진만 사용합니다.' : '아래 주소의 PC 엔진만 사용합니다.';
  return `${now} ${how}`.trim();
}

// Captions come a little after the stills (the PC fetches the transcript / reads the subtitle track): keep asking.
async function loadCaptions(turn) {
  const note = $('capnote');
  capTurn += 1; const ct = capTurn; capAi = false;
  const mine = () => turn === loadTurn && ct === capTurn;
  capTrack.setCues([]); capTrack.reset(); capTrack.lag = 0; $('capline').textContent = '';
  note.hidden = false; note.textContent = '자막을 찾는 중…';
  let cy = yt;   // 0.8.43: the player whose engine writes the captions
  if (pcCaptions(pcOn && capPcOn, yt.base, PHONE_ENGINE, loaded)) {
    try {
      capYt.base = pcBase(); capYt.info = null;
      // a tiny 16x9 at 1 still/s: the PC only needs the sound and the subtitle track, not good pictures
      await (loaded.kind === 'live' ? capYt.loadLive(loaded.url, 16, 9, 1) : capYt.load(loaded.url, 16, 9, 1));
      if (!mine()) return;
      cy = capYt; log(`captions: written by the PC (${capYt.base}) while the phone engine plays`);
    } catch (e) {
      if (!mine()) return;
      log(`captions: the PC did not take them (${e?.message ?? e}): the phone engine writes them`);
    }
  }
  let kept = Date.now();
  try {
    for (let i = 0; i < 800 && mine(); i += 1) {
      let s;
      try { s = await cy.subs(aiCaps); } catch (e) {
        if (cy === yt) throw e;
        if (!mine()) return;
        log(`captions: the PC stopped answering (${e?.message ?? e}): back to the phone engine`);
        cy = yt; capAi = false; continue;
      }
      if (!mine()) return;
      // live on the PC: nobody asks it for stills, so say every 20 s that someone is still watching (else it closes after 2 min)
      if (cy === capYt && isLive() && Date.now() - kept > 20000) { kept = Date.now(); void capYt.seek(0).catch(() => {}); }
      if (s.state === 'loading') { await wait(1500); continue; }
      if (s.state === 'ai') {                     // 0.8.22: the engine is listening; the cues grow while we ask
        if (!capAi) log(`AI captions: ${engineWho(cy.base)} is listening (${s.source || 'speech to text'})`);
        capAi = true; i = 0;                       // keeps asking for as long as the video plays
        // 0.8.30: live lines arrive after their sound: show them that much later (videos keep lag 0)
        capTrack.lag = isLive() ? liveLag(capTrack.lag, lastPos, capTrack.cues, s.cues) : 0;
        capTrack.setCues(s.cues || []);
        note.textContent = s.note || `AI captions: listening… (${capTrack.size} lines so far)`;
        await wait(isLive() ? 1000 : 2000); continue;   // 0.8.35: live lines sooner
      }
      if (s.state === 'ready' && s.cues?.length) {
        capTrack.setCues(s.cues);
        const where = glass && !glass.captions ? ' Shown on the phone only: the glasses need version 5.' : '';
        note.textContent = `Captions ready (${s.lang || 'text'}, ${capTrack.size} lines).${where}`;
        log(`captions: ${s.cues.length} cues, ${s.lang || '?'}, from ${s.source || '?'} (${engineTag(cy.base)})`);
      } else {
        note.textContent = ''; note.hidden = true;        // owner 2026-11-06: no captions = no message; the reason goes to the log
        log(`no captions for this video${s.note ? `: ${s.note}` : ''}`);
      }
      return;
    }
    if (mine()) note.textContent = `자막 · ${engineWho(cy.base)} is still working on them.`;
  } catch (e) {
    if (mine()) note.textContent = `자막 · ${e?.message ?? e}`;
  }
}

// Between channels: the hiss starts before the first await (inside the tap, or the WebView blocks sound).
async function tuneShow(src, title) {
  if (!tuneOn) return;
  if (hissOn && sound === 'phone') hiss.start();
  if (!glass?.tune) return;
  const ch = queue && queue.items[queue.index] === src ? queue.index + 1 : 0;
  try { await link.send(tuneBytes(ch, title)); tuneSent = true; } catch { /* glasses gone */ }
}
// 0.8.9: tell glasses v11 whether to show the screensaver when idle. Older glasses never say saver in HELLO: nothing sent.
// 0.8.11: the CRT look goes only to glasses that said version 12 or newer in HELLO (the flags byte is full).
async function crtSend() {
  if (!glass?.crt) return;
  try { await link.send(crtBytes(crtOn)); log(`CRT look ${crtOn ? 'on' : 'off'} sent to the glasses`); } catch { /* glasses gone */ }
}
// 0.8.36: only glasses that said version 16 or newer in HELLO get 56 0A (older ones keep blocks).
async function smoothSend() {
  if (!glass?.smooth) return;
  try { await link.send(smoothBytes(smoothOn)); log(`smoothing ${smoothOn ? 'smooth' : 'blocks'} sent to the glasses`); } catch { /* glasses gone */ }
}
// 0.8.41: only glasses that said version 17 or newer in HELLO get 56 0B (older ones keep whole-number zoom).
async function fitSend() {
  if (!glass?.fit) return;
  // At 240x135 Full and Big are both x2 (480x270), so the glasses cannot tell them apart: only Full asks for the fill.
  const on = fitOn && glassPicture() === 'full';
  try { await link.send(fitBytes(on)); log(`fill the screen ${on ? 'on' : 'off'} sent to the glasses`); } catch { /* glasses gone */ }
}
// 0.8.21: only glasses that said version 13 or newer in HELLO get 56 08 (older ones would ignore it anyway).
async function glowSend() {
  if (!glass?.glow) return;
  try { await link.send(brightBytes(glow)); log(`glasses brightness ${glow || 'Auto'} sent`); } catch { /* glasses gone */ }
}
// 0.8.23: only glasses that said version 15 or newer in HELLO get 56 09; the phone wraps captions to that font's width.
// 0.8.44: also after a Size / Picture / Fill change: the lines follow the picture's width (capLayout).
function capLayout() {
  const [w, h] = size, dw = glass?.dispW ?? 600, dh = glass?.dispH ?? 350, pic = glassPicture();
  const picW = picWidth(w, h, pictureScale(w, h, dw, dh, pic), dw, dh, fitOn && pic === 'full' && !!glass?.fit);
  return capFit({ font: capFont, picW, glassFont: !!glass?.font, fit: capFitOn });
}
let capFontSent = -1;
async function fontSend() {
  const lay = capLayout();
  capTrack.setCols(lay.cols);
  if (!glass?.font) return;
  if (lay.font === capFontSent) return;
  try { await link.send(fontBytes(lay.font)); capFontSent = lay.font; log(`caption letters ${CAP_FONTS[lay.font]} sent${lay.font !== capFont ? ' (small picture)' : ''}, ${lay.cols} a line`); } catch { /* glasses gone */ }
}
async function saverSend() {
  if (!glass?.saver) return;
  try { await link.send(saverBytes(saverOn)); log(`screensaver ${saverOn ? 'on' : 'off'} sent to the glasses`); } catch { /* glasses gone */ }
}
async function tuneOff() {
  adBreak.end();
  hiss.stop();
  if (!tuneSent) return;
  tuneSent = false;
  try { await link.send(CLEAR); } catch { /* glasses gone */ }
}

// 0.9.5: tell the engine which Live channels to keep ready (next + previous), or none. Skipped while a switch runs,
// so the channel being tuned in is not dropped halfway. Sends [] once when nothing live plays any more.
let warmBusy = false, warmOldSaid = false;
async function warmNow() {
  if (warmBusy || stepping || ytLoading || !yt.base) return;
  const want = warmOn && busy && isLive() ? warmTargets(queue, loaded) : [];
  if (!want.length && !warmAsked.length) return;
  warmBusy = true;
  try {
    const r = await yt.warm(want, size[0], size[1], undefined, look);
    if (!sameList(want, warmAsked)) log(want.length ? `getting ready in the background: ${want.length} channel${want.length > 1 ? 's' : ''}` : 'background channels stopped');
    warmAsked = want;
    warmGot = r ? warmReady(r) : [];
    if (!r && want.length && !warmOldSaid) { warmOldSaid = true; log('background channels: the engine did not take the list (engine older than 0.7.31, or YTCAST_WARM=off there)'); }
    if (r) warmOldSaid = false;
  } finally { warmBusy = false; }
}

// auto = the caller starts the video right after: the snow then stays until the first picture.
async function loadVideo(src, auto = false, pcRetry = false) {
  if (busy || ytLoading) return;
  const iptv = isIptvId(src.url);
  const base = await useEngine(src.kind === 'nas' ? 'nas' : '', iptv);
  if (busy || ytLoading) return;
  yt.iptvPc = iptv && base !== PHONE_ENGINE;   // 0.8.46: tells the PC this IPTV ask is on purpose
  const who = engineWho(base);
  if (switchTimer.cur && switchTimer.cur.picture == null) switchTimer.cur.who = who;
  let retryOnPc = false;
  ytReady = false; ytLoading = true; lastLum = null; startAt = 0; lastPos = 0; loaded = src; loadTurn += 1;
  const turn = loadTurn;
  paintChoices();
  const note = $('ytnote');
  try {
    // 0.9.5: a channel the engine kept running in the background switches at once: no snow, no hiss, the last
    // picture stays until the new channel's first still.
    const hot = warmOn && warmHot(warmGot, src);
    if (hot) log(`"${src.name || 'channel'}" was ready in the background: switching at once`);
    else await tuneShow(src, src.name || src.title || '');
    if (auto && !hot) adBreak.arm(src.name || src.title || '');   // 0.8.32: an ad if the channel is slow
    let live = src.kind === 'live';
    const vod = src.kind === 'vod';   // 0.8.40: an IPTV movie or episode (xcm: / xce:), found by search
    note.textContent = src.kind === 'nas' ? `Asking ${who} to open ${src.name}…` : live ? `Asking ${who} to tune in ${src.name}…` : `Asking ${who} to fetch the video…`;
    const info = src.kind === 'nas' ? await yt.loadFile(src.rel, size[0], size[1], undefined, look)
      : (live || vod) ? await yt.loadLive(src.url, size[0], size[1], undefined, look)
        : await yt.load(src.url, size[0], size[1], undefined, look);
    live = live || !!info.live;   // a pasted YouTube link can be a live stream too: played the same way
    log(live ? `${engineTag()}: live "${info.title}", ${info.w}x${info.h} @ ${info.fps} stills/s, look ${info.look}`
      : `${engineTag()}: "${info.title}" ${Math.round(info.duration)} s, ${info.w}x${info.h} @ ${info.fps} stills/s, look ${info.look}`);
    if (info.title && !hot) await tuneShow(src, info.title);
    if (!live || aiCaps) void loadCaptions(turn);   // live has no captions of its own: only AI ones (0.8.22)
    // 0.8.28 (owner: "Still no audio from the phone engine"): the phone downloads the sound slower than the PC; the
    // 20 s sound wait ran out, so no copy was made and the video played silent. On the phone engine wait up to 3 min.
    // 0.8.40: an IPTV film copies its whole sound first (the panel allows one stream at a time), so wait longer.
    const phoneWait = needsBlobSound(yt.base) && !live ? { soundWaitMs: 180000, timeoutMs: 240000 } : {};
    if (vod && !live && needsBlobSound(yt.base)) Object.assign(phoneWait, { soundWaitMs: 900000, timeoutMs: 960000 });
    const s = await yt.waitReady({ ...phoneWait, onTick: (t) => { note.textContent = live ? `${engineTag()} tuning in: ${t.ready} stills so far${t.audio ? ', sound ready' : ', waiting for sound…'}` : `${engineTag()} making stills: ${t.ready} of ${t.count}${t.audio ? ', sound ready' : src.kind === 'nas' ? ', copying the sound (a big film takes about 4 minutes the first time, then it is kept)…' : vod ? ', copying the sound first (IPTV allows one stream at a time; a film can take a few minutes)…' : ', fetching sound…'}`; } });
    if (audio) { audio.pause(); if (audio.native) audio.stop(); }
    dropSoundCopy();
    // 0.9.10: phone engine sound plays in Media Link (no copy of the whole sound in the page = no low-memory crash)
    let nat = null;
    if (nativeOn && !live && s.audio && needsBlobSound(yt.base)
      && useNative({ on: nativeOn, live, url: yt.audioUrl(), linkOk: await linkHasSound(soundFetch) })) {
      note.textContent = 'Media Link에서 소리를 준비하는 중…';
      nat = new NativeSound({ fetchFn: soundFetch }); nat.src = yt.audioUrl();
      if (await nat.load()) log('phone engine: sound plays in Media Link (no copy in the page)');
      else { log(`Media Link could not get the sound ready${nat.err ? ` (${nat.err})` : ''} — copying it as before`); nat.stop(); nat = null; }
    }
    audio = nat || new Audio();
    audio.addEventListener('playing', () => switchMark('sound'));   // 0.8.32: switch timing
    audio.preload = live ? 'none' : 'auto';   // live: the endless stream is asked for at Start, not now (it must begin where the sound is then)
    if (nat) { /* ready in Media Link */ }
    else if (!needsBlobSound(yt.base)) audio.src = yt.audioUrl();
    else if (!live && s.audio) {   // 0.8.25: phone engine (http): the app lets <audio> play only https/blob, so fetch a copy
      const level = await memoryLevel(soundFetch);   // 0.9.10 memory guard: '' = Media Link too old to say
      if (!copyAllowed(level)) log('phone memory is critical: the sound is NOT copied (that can crash the app) — pictures only. Close other apps, or turn on Phone sound player.');
      else {
        note.textContent = '휴대폰 엔진에서 소리를 가져오는 중…';
        try { soundCopy = await soundBlobUrl(soundFetch, yt.audioUrl()); audio.src = soundCopy; log(`phone engine: sound copied, ready to play${level === 'low' ? ' (phone memory is low)' : ''}`); } catch (e) { log(`phone sound copy failed: ${e?.message ?? e}`); }
      }
    } else if (!live && sound === 'phone') log(`phone engine: no sound yet after the wait${s.error ? ` (${s.error})` : ''} - pictures only. Load it again in a minute.`);
    audio.addEventListener('error', () => log('phone sound failed to load (try Sound: PC speakers)'));
    const first = await yt.fetchFrame(live ? Math.max(0, (info.afrom || 0)) : 0);
    if (first) { lastLum = first.lum; lastLook = info.look || 'normal'; preview(info.w, info.h, 0); }
    ytReady = true;
    note.textContent = live ? `실시간 · ${info.title}${s.audio ? '' : ' · 소리 준비 중'} · 재생을 누르세요.`
      : `Ready: ${info.title} (${clockText(info.duration)})${s.audio ? '' : ' — no sound'} · 재생을 누르세요.`;
  } catch (e) {
    log(`load (${who}): ${e?.message ?? e}`);
    if (base === PHONE_ENGINE && effMode() === 'auto' && !pcRetry && (!iptv || iptvPcOn)) {
      retryOnPc = true;            // 0.8.26: Auto: the phone engine failed this one, the PC tries it (phone skipped for a minute)
      chooser.markDown(60000);
      note.textContent = `The phone engine could not load it (${e?.message ?? e}): trying the PC…`;
    } else {
      note.textContent = `불러오기 실패 · ${e?.message ?? e}. Is ${who === 'the PC' ? 'the PC service' : 'the phone engine'} running? (${base}/health)`;
      if (iptv && base === PHONE_ENGINE) note.textContent += ' IPTV stays on the phone (your plan allows one stream). A 4XX means something else is using it: wait 2 minutes or close it there.' + (pcOn ? ' Engine: PC uses the PC instead.' : '');   // 0.9.0: no PC advice while the PC subsystem is Off
      if (src.kind === 'live') liveOfferHide(src);   // 0.8.11: a channel that does not work can be turned off right here
    }
  }
  if (retryOnPc) { ytLoading = false; return loadVideo(src, auto, true); }
  if (!auto || !ytReady) await tuneOff();
  ytLoading = false; paintChoices();
}

function loadYoutube() {
  const url = $('yturl').value.trim();
  if (!isYoutube(url)) { $('ytnote').textContent = '먼저 YouTube 링크를 입력하세요.'; return; }
  queue = null;            // a pasted link has nothing in line after it
  void loadVideo({ kind: 'youtube', url });
}

// A size or look change needs new stills from the PC: load the same video again (not while one plays).
function reloadIfLoaded(why) {
  if (!ytReady || !loaded) return;
  ytReady = false; lastLum = null;
  $('ytnote').textContent = `${why} changed: loading again…`;
  void loadVideo(loaded);
}

// ---------- NAS list: the PC lists its NAS video folder (read only); folders first, then the videos ----------
function nasButton(text, cls, onTap, sizeLabel) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = `secondary ${cls}`;
  b.append(text);
  if (sizeLabel) { const s = document.createElement('span'); s.className = 'size'; s.textContent = sizeLabel; b.append(s); }
  b.addEventListener('click', onTap);
  return b;
}
async function nasOpen(dir, q = '') {
  await useEngine('nas'); nasTurn += 1;
  const turn = nasTurn;
  const list = $('naslist');
  $('naspath').textContent = `NAS${dir ? ` / ${dir.split('/').join(' / ')}` : ''} · 불러오는 중…`;
  try {
    const r = await yt.nasList(dir, q);
    if (turn !== nasTurn) return;
    nasDir = r.dir || ''; nasParent = r.parent ?? null;
    const join = (name) => (nasDir ? `${nasDir}/${name}` : name);
    const nasLine = (r.files || []).map((f) => ({ kind: 'nas', rel: join(f.name), name: f.name, size: f.size }));
    const items = [
      ...(r.dirs || []).map((name) => nasButton(`${name} /`, 'dir', () => { $('nasfilter').value = ''; void nasOpen(join(name)); })),
      ...nasLine.map((src, i) => nasButton(src.name, 'file', () => { queue = { from: 'nas', items: nasLine, index: i }; void loadVideo(src); }, sizeText(src.size || 0))),
    ];
    list.replaceChildren(...items);
    const count = `${(r.dirs || []).length} folders, ${(r.files || []).length} videos`;
    $('naspath').textContent = `NAS${nasDir ? ` / ${nasDir.split('/').join(' / ')}` : ''} — ${items.length ? count : 'nothing here'}${r.more ? ' (first 300 shown: type in the filter)' : ''}`;
  } catch (e) {
    if (turn !== nasTurn) return;
    list.replaceChildren();
    $('naspath').textContent = `NAS: ${e?.message ?? e}. Is ${engineWho()} running and the NAS on?`;
    log(`nas: ${e?.message ?? e}`);
  }
  paintChoices();
}

// 0.9.2 (owner 2026-11-10: "Can we show covers"): channel logos, film / show pictures and the last pick on the Browse
// tiles. Initials on a colour always; a picture over it when there is one. Off = no covers at all.
let coversOn = true;
let tilePics = {};
const logos = new LogoCache({ fetchFn: (u) => fetch(u), base: () => yt.base });
function cov(name, pic, wide = false, cls = '') { return coversOn ? coverEl(document, { name, pic, wide, cls }) : null; }
const logoOf = (id) => (hasLogoId(id) ? logos.logo(id) : '');
// 0.9.2 (owner: "Press and hold to unfavorite a channel", picked Ask first): hold a favorite ~0.6 s, then Yes / No.
const HOLDFAV_KEY = 'mmvideo.holdfav';
const HOLD_MS = 600;
let holdFavOn = true;
// 0.9.3 (owner: "Give me a YouTube tab for my favorite channels"): his channels as picture chips on the YouTube tab.
let ytChans = cleanChans(null);
let ytChansOn = true;
// ---------- Library: the films the PC keeps ready (sound + subtitles copied ahead, 3 more each night) ----------
function span(cls, text) {
  const s = document.createElement('span');
  s.className = cls; s.textContent = text;
  return s;
}
// tuck(true): the picked list folds shut and the source section goes below the player, so the picture, Start and
// the jump buttons are at the top. tuck(false): back to the normal order with the list open.
function tuck(on) {
  tucked = on; listOpen = !on;
  // 0.9.0: the player sits on top already (the hero), so nothing moves; a pick scrolls up to it
  if (on && typeof window.scrollTo === 'function') window.scrollTo(0, 0);
}
// 0.9.0: show a tab (home | live | movies | shows | search | news | nas).
function goView(v) {
  if (!v || (v === 'nas' && !pcOn)) v = 'home';
  // 0.9.2 (owner: "if I'm on the phone only that shouldn't be there"): the film library lives on the PC / NAS, so with the
  // PC subsystem Off, Movies opens the IPTV movie search instead. PC subsystem On = the library as before.
  // 0.9.4: it stays the Movies tab (the tab bar lit Search before); the Search tab goes back to channels.
  if (v === 'movies' && !pcOn) liveSKind = 'movie';
  else if (v === 'search' && view === 'movies' && liveSKind === 'movie') liveSKind = 'live';
  view = v;
  const pat = movieSearch() ? 'live' : VIEW_PATTERN[v];
  const btn = pat ? document.querySelector(`[data-pattern="${pat}"]`) : null;
  if (btn && !busy && !ytLoading && pattern !== pat) btn.click();   // idle: the old source tap (opens its list)
  else if (pat === 'live') liveOpen();
  else if (pat === 'library') void libOpen();
  else if (pat === 'news') void newsOpen();
  else if (pat === 'nas' && !$('naslist').children.length) void nasOpen(nasDir);
  if (liveShown()) livePaint(); else paintChoices();
  if (v === 'search' || movieSearch()) { const q = $('livesq'); if (q && typeof q.focus === 'function') q.focus(); }
  if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);
}
// 0.9.0: the Settings sheet (gear, top right). Five basics on top, Advanced folded below, the PC subsystem inside it.
function sheet(on) {
  $('settingsheet').hidden = !on;
  document.body.classList.toggle('sheetopen', on);
  $('gear').setAttribute('aria-expanded', String(on));
}
// The short name of what is loaded, for the now-playing bar before the PC has told us the title.
function pickName(src) {
  if (!src) return '';
  if (src.name) return src.name;
  if (src.url) return src.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60);
  return src.rel || '';
}
// 0.8.8: stop whatever plays and wait until it has really ended (busy false), at most ~15 s. True when clear.
async function stopFirst() {
  if (busy) { log('tap while playing: stopping first'); stopAll(); }
  for (let n = 0; n < 150 && busy; n += 1) await wait(100);
  return !busy;
}
// One tap: load the pick, then start it. (A load that fails, or a tap on something else meanwhile, starts nothing.)
// Something already playing is stopped first (0.8.8); a pick while a load is still running is ignored.
async function playPick(src, from) {
  if (ytLoading) return;
  switchBegin(src);
  if (!(await stopFirst()) || ytLoading) return;
  if (from && pattern !== from) { pattern = from; paintChoices(); }   // 0.9.0: a pick from Home / another tab plays as its own source
  tuck(true);
  const gen = switchGen;   // 0.8.34: a newer tap since this one wins
  await loadVideo(src, true);
  const ready = () => ytReady && loaded === src && !busy && (!from || pattern === from);
  // 0.8.34 (owner: "It can cut midway when channel is ready ... and can stretch for a while"): the ad on show ends
  // at its next scene (or plays out if nearly done), then the channel starts.
  if (ready()) { await adBreak.settle(); if (gen !== switchGen) return; }
  if (ready()) startVideo(); else await tuneOff();
}
// A pick from a list: remember the list as the line, then play the pick.
function playFrom(from, items, index) {
  if (ytLoading) return Promise.resolve();
  if (!iptvOn && isIptv(items[index]?.url)) {   // 0.9.9: IPTV off = the phone never tunes IPTV (the home box keeps it)
    log(`IPTV is off: ${items[index].name || 'that channel'} not tuned (Settings > IPTV channels)`);
    return Promise.resolve();
  }
  noteLast(queue, from === 'live' ? items[index] : null);
  queue = { from, items, index };
  const it = items[index];
  const tv = { live: it?.kind === 'vod' ? 'movies' : 'live', library: 'movies', youtube: 'shows', news: 'news' }[from];
  if (tv && it) { tilePics = tilePick(tilePics, tv, { url: it.url, id: it.url, name: it.name || queue.title || '' }); paintTiles(); void gm.storage.set(TILEPICS_KEY, tilePics).catch(() => {}); }
  return playPick(items[index], from);
}
const filmSrc = (film) => ({ kind: 'nas', rel: film.rel, name: film.title });
// Next (+1) or previous (-1) in line: from the glasses (double / triple tap) or by itself at the end of a video.
async function step(delta, auto = false) {
  const q = queue; const note = $('ytnote');
  if (!q || !isVideo() || pattern !== q.from) {
    if (!auto) note.textContent = '보관함, 뉴스, 실시간 또는 NAS에서 먼저 콘텐츠를 선택하세요.';
    return;
  }
  const i = q.index + delta;
  if (i < 0 || i >= q.items.length) {
    if (!auto) note.textContent = delta > 0 ? 'That is the last one in the list.' : 'That is the first one in the list.';
    else log('autoplay: the list is at its end');
    return;
  }
  if (stepping) return;
  stepping = true;
  try {
    if (busy) stopAll();
    for (let n = 0; n < 150 && (busy || ytLoading); n += 1) await wait(100);
    if (busy || ytLoading || queue !== q || pattern !== q.from) return;
    noteLast(q, q.items[i]);
    q.index = i;
    switchBegin(q.items[i]);
    const gen = switchGen;
    log(`${auto ? 'autoplay' : 'glasses'}: ${delta > 0 ? 'next' : 'previous'} in line (${i + 1} of ${q.items.length})`);
    if (q.from !== 'nas') tuck(true);
    await loadVideo(q.items[i], true);
    const ready = () => ytReady && loaded === q.items[i] && !busy && pattern === q.from;
    if (ready()) { await adBreak.settle(); if (gen !== switchGen) return; }   // 0.8.34: let the ad finish its scene
    if (ready()) startVideo(); else await tuneOff();
  } finally { stepping = false; }
}
function setCaptions(on) {
  captionsOn = on;
  capTrack.enabled = captionsOn;
  if (!captionsOn) $('capline').textContent = '';
  paintChoices();
}
// 0.8.38 (owner 2026-11-09: "3 tap for previous channel", picked "Last watched"): three taps on the glasses jump
// back to the channel watched before, like the Last button on a TV remote; three taps again go back. liveLast
// remembers the line and place of the channel left behind (any group, favorites too). Was: three taps = off.
let liveLast = null;
function noteLast(q, next) {
  const now = q?.from === 'live' ? q.items[q.index] : null;
  if (now && next && now !== next && (now.id ?? now.url ?? now.name) !== (next.id ?? next.url ?? next.name)) liveLast = { items: q.items, index: q.index, fav: !!q.fav };
}
function recallLast() {
  const l = liveLast;
  if (!l || !l.items[l.index]) { log('glasses: no channel watched before yet'); return; }
  log(`glasses: back to the last channel (${l.items[l.index].name || 'channel'})`);
  void playFrom('live', l.items, l.index).then(() => { if (l.fav && queue?.from === 'live') queue.fav = true; });
}
// What a touch on the glasses does (taps.js counts the taps).
// 0.8.9: with Tap = next channel on and a Live channel on, it is a TV remote: tap = next channel, double = the one
// before, triple = the channel watched before (0.8.38; was off). tvTaps() says when that mode applies (kept pure so the tests can pin it down).
function tvTaps() { return tapNextOn && pattern === 'live' && !!queue && queue.from === 'live' && busy; }
function onGesture(name) {
  if (name === 'hold') { setCaptions(!captionsOn); log(`glasses: captions ${captionsOn ? 'on' : 'off'}`); return; }
  if (!isVideo()) return;
  if (tvTaps()) {
    const last = queue.items.length - 1;                   // a TV wraps round: after the last channel comes the first
    if (name === 'tap') { void step(queue.index >= last ? -queue.index : 1); return; }
    if (name === 'double') { void step(queue.index <= 0 ? last : -1); return; }
    recallLast(); return;
  }
  if (name === 'tap') {
    if (busy) stopAll();                                   // pause: Stop keeps the place
    else if (ytReady && !ytLoading) startVideo();          // play: goes on from there
    else $('ytnote').textContent = '휴대폰에서 재생할 영상을 먼저 선택하세요.';
    return;
  }
  void step(name === 'double' ? 1 : -1);
}
const taps = new TapCounter({ onGesture: (name, seq) => { log(`glasses touch: ${name} (Host sent ${seq.join(' ')})`); onGesture(name); } });
async function libOpen() {
  await useEngine(); libTurn += 1;
  const turn = libTurn;
  const list = $('liblist');
  if (!list.children.length) $('libnote').textContent = '보관함 불러오는 중…';
  try {
    const r = await yt.library();
    if (turn !== libTurn) return;
    const films = r.films || [];
    const line = films.map(filmSrc);
    list.replaceChildren(...films.map((film, at) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `secondary film${film.ready ? ' ready' : ''}`;
      const c0 = cov(film.title || '?', ''); if (c0) b.append(c0);
      b.append(span('name', film.title || '?'));
      const facts = filmFacts(film);
      if (facts) b.append(span('facts', facts));
      if (film.plot) b.append(span('plot', film.plot));
      b.append(span('state', film.ready ? 'Ready — tap to play' : 'Not prepared yet — tap to play anyway (the first load copies the sound, about 4 minutes)'));
      b.addEventListener('click', () => { void playFrom('library', line, at); });
      return b;
    }));
    $('libnote').textContent = films.length
      ? `Library — ${films.length} films, ${r.ready ?? 0} ready. ${EngineWho()} prepares ${r.night ?? 3} more each night.`
      : `Library — no films yet. ${EngineWho()} makes the list on its first nightly run.`;
    log(`library: ${films.length} films, ${r.ready ?? 0} ready (list read ${r.scanned || 'never'})`);
  } catch (e) {
    if (turn !== libTurn) return;
    list.replaceChildren();
    $('libnote').textContent = `Library: ${e?.message ?? e}. Is ${engineWho()} running?`;
    log(`library: ${e?.message ?? e}`);
  }
  paintChoices();
}

// ---------- News: the newest uploads of the free news channels; the PC gets one pick per channel ready ahead ----------
async function newsOpen(again = false) {
  await useEngine(); newsTurn += 1;
  if (!again) newsAgain = 0;
  const turn = newsTurn;
  const list = $('newslist');
  if (!list.children.length) $('newsnote').textContent = '뉴스 불러오는 중…';
  try {
    const r = await yt.news();
    if (turn !== newsTurn) return;
    const items = r.items || [];
    const now = new Date();
    const line = items.map((item) => ({ kind: 'youtube', url: item.url }));
    list.replaceChildren(...items.map((item, at) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `secondary film${item.ready ? ' ready' : ''}`;
      const c0 = cov(item.title || '?', ytThumb(item.url), true); if (c0) { b.classList.add('hascov'); b.append(c0); }
      b.append(span('name', item.title || '?'));
      const facts = newsFacts(item, now);
      if (facts) b.append(span('facts', facts));
      b.append(span('state', item.ready ? (item.captions ? 'Ready, with captions — tap to play' : 'Ready — tap to play') : `Not prepared — tap to play anyway (${engineWho()} fetches it first)`));
      b.addEventListener('click', () => { void playFrom('news', line, at); });
      return b;
    }));
    $('newsnote').textContent = items.length
      ? `News — ${items.length} items from ${r.channels ?? 8} channels, ${r.ready ?? 0} ready.${r.refreshing ? ` ${EngineWho()} is reading the channels again…` : ''}`
      : r.refreshing ? `News — ${engineWho()} is reading the channels for the first time…` : `News — nothing yet. ${EngineWho()} reads the channels at 6 AM and 10:30 PM.`;
    log(`news: ${items.length} items, ${r.ready ?? 0} ready (channels read ${r.read || 'never'})`);
    if (r.refreshing && newsAgain < 4) {
      newsAgain += 1;
      setTimeout(() => { if (turn === newsTurn && pattern === 'news' && !busy && !ytLoading) void newsOpen(true); }, 6000);
    }
  } catch (e) {
    if (turn !== newsTurn) return;
    list.replaceChildren();
    $('newsnote').textContent = `News: ${e?.message ?? e}. Is ${engineWho()} running (version 0.6.0 or newer)?`;
    log(`news: ${e?.message ?? e}`);
  }
  paintChoices();
}

// ---------- Shows (0.8.24): YouTube quick links. The PC lists the show's newest uploads; a tap plays it like a pasted link ----------
// Owner: "add the joe rogan experience podcast and the why files channels as quick links so I dont have to fetch those".
// The line is the list, so a double tap on the glasses goes to the next episode (from = 'youtube', the tab they are on).
function showFacts(item) {
  const bits = [];
  if (item.minutes > 0) bits.push(item.minutes >= 60 ? `${Math.floor(item.minutes / 60)} h ${item.minutes % 60} min` : `${item.minutes} min`);
  const when = item.published ? newsFacts({ published: item.published }) : '';
  if (when) bits.push(when);
  return bits.join(' · ');
}
async function showsOpen(key) {
  await useEngine(); showTurn += 1; showKey = key; listOpen = true;
  const turn = showTurn;
  const list = $('showlist');
  list.replaceChildren();
  $('shownote').textContent = `Asking ${engineWho()} for the newest episodes…`;
  paintChoices();
  try {
    const r = await yt.shows(key);
    if (turn !== showTurn) return;
    const items = r.items || [];
    const line = items.map((item) => ({ kind: 'youtube', url: item.url }));
    list.replaceChildren(...items.map((item, at) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `secondary film${item.ready ? ' ready' : ''}`;
      const c0 = cov(item.title || '?', ytThumb(item.url), true); if (c0) { b.classList.add('hascov'); b.append(c0); }
      b.append(span('name', item.title || '?'));
      const facts = showFacts(item);
      if (facts) b.append(span('facts', facts));
      b.append(span('state', item.ready ? 'Ready — tap to play' : `Tap to play (${engineWho()} fetches it first)`));
      b.addEventListener('click', () => { $('yturl').value = item.url; void playFrom('youtube', line, at); });
      return b;
    }));
    $('shownote').textContent = items.length
      ? `${r.name} — the newest ${items.length}${r.old ? ' (YouTube did not answer; this list is from earlier)' : ''}.`
      : `${r.name} — nothing found just now.`;
    log(`shows: ${key}: ${items.length} episodes (${r.how || '?'}${r.old ? ', old list' : ''})`);
    if (hasChan(ytChans, key)) { const was = JSON.stringify(ytChans); ytChans = chanSeen(ytChans, key, r.name, ytThumb(items[0]?.url || '')); if (JSON.stringify(ytChans) !== was) { ytChansSave(); paintYtChans(); } }
  } catch (e) {
    if (turn !== showTurn) return;
    const m = String(e?.message ?? e);
    $('shownote').textContent = !BUILTIN.includes(key) && /404|no such show/i.test(m) ? `${EngineWho()} needs ytcast 0.7.29 or newer for your own channels (ask Claude to update it).`
      : /404/.test(m) ? `${EngineWho()} needs ytcast 0.7.7 or newer for Shows (ask Claude to restart it).` : `Shows: ${m}`;
    log(`shows: ${key}: ${m}`);
  }
  paintChoices();
}

// ---------- Live: a TV. Groups (chips) from the PC's guide + the phone's own list; the phone is the remote ----------
const liveSel = () => tvGroups(LIVE_CHANNELS, tvCache, tvGuideOn, hidden, iptvOn);
// 0.9.9 the Favorites line everywhere (strip, start on open, the line the player follows), Free first applied.
function favLine(groups) { return freeFirst(favGroup(favs, groups, hidden), groups, { on: freeFirstOn, iptv: iptvOn }); }
function liveGroupNow() { const gs = liveSel(); return gs.find((g) => groupKey(g) === tvGroup) || gs[0]; }
function livePlaying() {
  if (!queue || queue.from !== 'live' || !busy) return null;
  const it = queue.items[queue.index]; if (!it) return null;
  const ch = liveSel().flatMap((g) => g.channels).find((c) => c.id === it.url);
  return { name: it.name, now: ch?.now || '' };
}
// The light part: the note line and the "on" mark on the playing card. Called from paintChoices.
function liveMark() {
  $('livenote').textContent = liveNote({ groups: liveSel(), cache: tvCache, on: tvGuideOn, playing: livePlaying(), pcDown: tvPcDown });
  const cur = queue?.from === 'live' && busy ? queue.items[queue.index]?.url : null;
  for (const b of $('livelist').querySelectorAll('.film')) b.classList.toggle('on', !!cur && b.dataset.id === cur);
  for (const b of document.querySelectorAll('#livefavs button[data-id], #padfavs button[data-id], #homefavs button[data-id]')) b.setAttribute('aria-pressed', String(!!cur && b.dataset.id === cur));
  padNow();
}
// The heavy part: rebuild the chips and the cards of the group on show. Called when the tab opens or the guide changes.
function livePaint() {
  const groups = liveSel();
  const g = liveGroupNow(); tvGroup = groupKey(g);
  const labels = chipLabels(groups);
  $('livegroups').replaceChildren(...groups.map((x, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary';
    b.textContent = labels[i]; b.setAttribute('aria-pressed', String(x === g));
    b.addEventListener('click', () => { tvGroup = groupKey(x); livePaint(); void gm.storage.set(GROUP_KEY, tvGroup).catch(() => {}); });
    return b;
  }));
  livePaintFavs(groups);
  const line = lineOf(g);
  $('livelist').classList.toggle('editing', liveEditing);
  $('livelist').replaceChildren(...g.channels.map((c, at) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = liveEditing ? 'secondary film edit' : 'secondary film'; b.dataset.id = c.id;
    const c0 = cov(c.name, logoOf(c.id)); if (c0) b.append(c0);
    b.append(span('name', c.name));
    if (c.now) b.append(span('facts', c.now));
    if (!liveEditing) {
      b.append(span('state', `${c.number != null ? `Ch ${c.number}` : `Channel ${at + 1}`}${isFav(favs, c.id) ? ' ★' : ''}`));
      b.addEventListener('click', () => { void playFrom('live', line, at); });
      return b;
    }
    // Edit mode: the card itself stars / unstars; a small Hide button beside it turns the channel off (0.8.11).
    // 0.8.41 (owner: "Making channels favorite and not should be an iPhone switch"): a Favorite switch beside the card.
    b.append(span('state', isFav(favs, c.id) ? '★ Favorite — tap to remove' : '☆ Tap to make it a favorite'));
    b.addEventListener('click', () => { liveFav(c); });
    const h = document.createElement('button'); h.type = 'button'; h.className = 'secondary small hide'; h.textContent = '숨기기';
    h.addEventListener('click', () => { liveHide(c.id, c.name); });
    const w = document.createElement('div'); w.className = 'edit'; w.append(b, favSwitch(isFav(favs, c.id), c.name, () => { liveFav(c); }), h);
    return w;
  }));
  paintChoices();
}
// 0.8.12 The favorites strip under the remote. A tap tunes that favorite AND makes the favorites the line, so Channel
// ◀ ▶ and the glasses taps go favorite to favorite. Empty: one quiet hint. Hidden favorites stay out until shown again.
function livePaintFavs(groups) {
  const fg = favLine(groups); const line = lineOf(fg);
  const cur = queue?.from === 'live' && busy ? queue.items[queue.index]?.url : null;
  for (const id of ['livefavs', 'padfavs', 'homefavs']) {   // 0.9.0: + the Home row   // 0.8.13: the same strip sits at the bottom of the touchpad
    if (!fg.channels.length) {
      const p = document.createElement('p'); p.className = 'favhint';
      p.textContent = favs.length ? 'Favorites: all hidden (Settings > Hidden channels > Show all).' : 'Favorites: none yet. Tap Edit, then ☆ on a channel.';
      $(id).replaceChildren(p); continue;
    }
    $(id).replaceChildren(...fg.channels.map((c, at) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary'; b.dataset.id = c.id;
      const c0 = cov(c.name, logoOf(c.id), false, 'chipcov'); if (c0) b.append(c0);
      b.append(span('chipname', `★ ${c.name}`)); b.setAttribute('aria-pressed', String(!!cur && c.id === cur));
      b.addEventListener('click', () => { if (holdFired(b)) return; void playFrom('live', line, at); if (queue?.from === 'live') queue.fav = true; });
      holdable(b, () => { favAsk(c.favOf ? { id: c.favOf, name: c.favName } : c); });   // 0.9.9: a free twin edits the real favorite
      return b;
    }));
  }
}
// 0.9.2 hold to unfavorite: a press held HOLD_MS fires once and eats the click that follows; moving or lifting earlier
// is a normal tap. The setting Off = taps only (as before).
function holdable(b, onHold) {
  let t = null;
  const clear = () => { if (t) { clearTimeout(t); t = null; } };
  b.addEventListener('pointerdown', () => { clear(); delete b.dataset.held; if (!holdFavOn) return; t = setTimeout(() => { t = null; b.dataset.held = '1'; onHold(); }, HOLD_MS); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, clear);
  b.addEventListener('contextmenu', (e) => { if (holdFavOn) e.preventDefault(); });   // no phone long-press menu
}
function holdFired(b) { if (b.dataset.held !== '1') return false; delete b.dataset.held; return true; }
// Ask first (his pick): a small page dialog, never window.confirm (the phone app has no popups).
function favAsk(c) {
  const box = $('favask');
  $('favasktext').textContent = `즐겨찾기에서 ${c.name}을(를) 삭제할까요?`;
  box.hidden = false;
  $('favaskyes').onclick = () => { box.hidden = true; if (isFav(favs, c.id)) liveFav(c); };
  $('favaskno').onclick = () => { box.hidden = true; };
  $('favaskno').focus?.();
}
// 0.9.2 Browse tiles; 0.9.3 (owner: "by covers I meant actual pictures"): a real photo on every tile, or the last
// YouTube pick's own picture. Off = plain tiles.
function paintTiles() {
  for (const t of document.querySelectorAll('.tile[data-go]')) {
    t.querySelector('.tilecov')?.remove();
    const p = tilePics[t.dataset.go];
    const pic = (p?.yt && ytThumb(p.yt)) || tilePhoto(t.dataset.go);
    t.classList.toggle('haspic', !!(coversOn && pic));
    if (!coversOn || !pic) continue;
    const c0 = coverEl(document, { name: p?.name || t.dataset.go, pic, wide: true, cls: 'tilecov' });
    t.prepend(c0);
  }
}
// 0.9.3 his YouTube channels: tap = newest videos, hold = remove (ask first), + = add by link or @name.
function paintYtChans() {
  $('ytchanbox').hidden = !ytChansOn;
  const row = $('ytchans');
  row.replaceChildren(...ytChans.map((c) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary'; b.dataset.show = c.key;
    const c0 = cov(c.name, c.pic, false, 'chipcov'); if (c0) b.append(c0);
    b.append(span('chipname', c.name));
    b.addEventListener('click', () => { if (holdFired(b)) return; if (!ytLoading) void showsOpen(c.key); });
    holdable(b, () => { chanAsk(c); });
    return b;
  }));
  paintChoices();
}
function ytChansSave() { void gm.storage.set(YTCHANS_KEY, ytChans).catch(() => {}); }
function chanAsk(c) {
  const box = $('favask');
  $('favasktext').textContent = `내 YouTube 채널에서 ${c.name}을(를) 삭제할까요?`;
  box.hidden = false;
  $('favaskyes').onclick = () => { box.hidden = true; ytChans = removeChan(ytChans, c.key); ytChansSave(); paintYtChans(); log(`youtube channel removed: ${c.name}`); };
  $('favaskno').onclick = () => { box.hidden = true; };
  $('favaskno').focus?.();
}
function ytAdd() {
  const key = chanKey($('ytaddurl').value);
  if (!key) { $('shownote').textContent = 'YouTube 채널 링크 또는 @이름을 입력하세요.'; return; }
  if (hasChan(ytChans, key)) { $('shownote').textContent = `${key} is already in your channels.`; return; }
  const more = addChan(ytChans, key);
  if (more === ytChans) { $('shownote').textContent = '채널이 최대 30개입니다. 삭제할 채널을 길게 누르세요.'; return; }
  ytChans = more; ytChansSave(); $('ytaddurl').value = '';
  log(`youtube channel added: ${key}`);
  paintYtChans();
  if (!ytLoading) void showsOpen(key);
}
function liveFav(c) {
  const was = isFav(favs, c.id);
  favs = toggleFav(favs, c);
  void gm.storage.set(FAV_KEY, favs).catch(() => {});
  log(`favorite ${was ? 'removed' : 'added'}: ${c.name} (${favs.length} favorite${favs.length === 1 ? '' : 's'})`);
  if (queue?.from === 'live' && queue.fav) liveRequeue('');
  livePaint();
}
// 0.8.11 Hide a channel: it leaves the cards, the remote and the glasses taps at once; the choice is kept on the phone.
// If the line the player follows came from Live, it is rebuilt without the hidden ones so next / previous skip them.
function liveHide(id, name) {
  hidden = hideId(hidden, id);
  void gm.storage.set(HIDDEN_KEY, hidden).catch(() => {});
  log(`channel hidden: ${name} (${hidden.length} hidden)`);
  liveRequeue(id);
  $('livehide').hidden = true;
  livePaint();
  if (!liveEditing) $('livenote').textContent = `${name} hidden. Settings > Hidden channels > Show all brings it back.`;
}
function liveRequeue(hiddenId) {
  if (queue?.from !== 'live') return;
  const cur = queue.items[queue.index]?.url;
  const line = lineOf(queue.fav ? favLine(liveSel()) : liveGroupNow());
  if (!line.length) { queue = null; return; }
  const at = line.findIndex((it) => it.url === cur);
  queue.items = line;
  queue.index = at >= 0 ? at : wrapIndex(queue.index, line.length);
  if (cur === hiddenId && busy) { stopAll(); $('livenote').textContent = '이 채널을 숨겼습니다. 다른 채널을 선택하거나 채널 ▶를 누르세요.'; }
}
function liveOfferHide(src) {
  const b = $('livehide');
  b.textContent = `Hide ${src.name || 'this channel'}`;
  b.hidden = false;
  b.onclick = () => { liveHide(src.url, src.name || 'channel'); };
}
// 0.8.40 (owner: "Allow me to search channels by name from my iptv ... movies and tv shows"): the whole IPTV panel
// by name, on the engine in use (phone or PC). Channels play live; movies and episodes as 'vod' (sound copied first).
// A tap makes the results the line, so Channel / the glasses taps go through them in order.
function liveSCard(name, facts, state, onTap, id = '') {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'secondary film';
  const c0 = cov(name, logoOf(id)); if (c0) b.append(c0);   // 0.9.2: the IPTV logo / poster (engine 0.7.28+), else initials
  b.append(span('name', name));
  if (facts) b.append(span('facts', facts));
  b.append(span('state', state));
  b.addEventListener('click', onTap);
  return b;
}
async function liveSearch() {
  const q = $('livesq').value.trim(); const note = $('livesnote'); const res = $('livesres');
  const gen = (liveSGen += 1); const kind = liveSKind;
  if (!q) { note.hidden = true; res.hidden = true; res.replaceChildren(); liveSHits = null; return; }
  note.hidden = false;
  note.textContent = `Searching IPTV ${SKIND_WORD[kind]} for "${q}"… (the first search can take about 30 s)`;
  try {
    await useEngine('');
    const r = await yt.iptvSearch(q, kind);
    if (gen !== liveSGen) return;
    const hits = Array.isArray(r?.results) ? r.results : [];
    liveSHits = { kind, q, hits };
    note.textContent = hits.length ? `${hits.length} ${SKIND_WORD[kind]} match "${q}"${hits.length >= 60 ? ' (the first 60: add a word)' : ''}.`
      : `No ${SKIND_WORD[kind]} named "${q}". Try fewer letters, or another of Channels / Movies / Shows.`;
    liveSearchPaint();
  } catch (e) {
    if (gen === liveSGen) note.textContent = `검색 실패 (${engineWho(yt.base)}): ${e?.message ?? e}`;
  }
}
function liveSearchPaint() {
  const res = $('livesres'); const s = liveSHits;
  if (!s || !s.hits.length) { res.hidden = true; res.replaceChildren(); return; }
  res.hidden = false;
  if (s.kind === 'series') {
    res.replaceChildren(...s.hits.map((h) => liveSCard(h.name, h.group, 'Show — tap for the episodes', () => { void liveShow(h); }, h.id)));
    paintChoices(); return;
  }
  const line = s.hits.map((h) => ({ kind: s.kind === 'live' ? 'live' : 'vod', url: h.id, name: h.name }));
  res.replaceChildren(...s.hits.map((h, at) => {
    const b = liveSCard(h.name, h.group, s.kind === 'live' ? `${isFav(favs, h.id) ? '★ ' : ''}Tap to tune in` : 'Movie — tap to play', () => { void playFrom('live', line, at); }, h.id);
    if (s.kind !== 'live') return b;
    const star = favSwitch(isFav(favs, h.id), h.name, () => { liveFav({ id: h.id, name: h.name }); liveSearchPaint(); });
    const w = document.createElement('div'); w.className = 'edit'; w.append(b, star);
    return w;
  }));
  paintChoices();
}
// 0.8.41 (owner 2026-11-09: "Making channels favorite and not should be an iPhone switch"): an on/off switch, green
// when the channel is a favorite. A real button (role switch, aria-checked) so a screen reader says Favorite on/off.
function favSwitch(on, name, toggle) {
  const s = document.createElement('button'); s.type = 'button'; s.className = 'favswitch';
  s.setAttribute('role', 'switch'); s.setAttribute('aria-checked', String(!!on));
  s.setAttribute('aria-label', `${name}: favorite`);
  const k = document.createElement('span'); k.className = 'knob';
  const tr = document.createElement('span'); tr.className = 'track'; tr.append(k);
  s.append(tr, span('favword', on ? '★ Fav' : 'Fav'));
  s.addEventListener('click', (e) => { e?.stopPropagation?.(); toggle(); });
  return s;
}
async function liveShow(h) {
  const note = $('livesnote'); const res = $('livesres'); const gen = (liveSGen += 1);
  note.hidden = false; note.textContent = `${h.name} 여는 중…`;
  try {
    const r = await yt.iptvSeries(h.id);
    if (gen !== liveSGen) return;
    const seasons = Array.isArray(r?.seasons) ? r.seasons : [];
    const show = r?.name || h.name;
    const line = []; const rows = [];
    const back = document.createElement('button'); back.type = 'button'; back.className = 'secondary small';
    back.textContent = '◀ 검색 결과로 돌아가기';
    back.addEventListener('click', () => { liveSGen += 1; note.textContent = `${liveSHits?.hits.length || 0} shows match "${liveSHits?.q || ''}".`; liveSearchPaint(); });
    rows.push(back);
    for (const s of seasons) {
      const p = document.createElement('p'); p.className = 'livegroup'; p.textContent = `시즌 ${s.season}`; rows.push(p);
      for (const e of s.episodes || []) {
        const at = line.length;
        line.push({ kind: 'vod', url: e.id, name: `${show} S${s.season}E${e.episode} ${e.name}` });
        rows.push(liveSCard(`${e.episode}. ${e.name}`, e.secs ? clockText(e.secs) : '', 'Tap to play (then ▶ goes to the next one)', () => { void playFrom('live', line, at); }));
      }
    }
    note.textContent = line.length ? `${show}: ${line.length} episode${line.length === 1 ? '' : 's'} in ${seasons.length} season${seasons.length === 1 ? '' : 's'}.` : `${show}: no episodes on the panel.`;
    res.hidden = false; res.replaceChildren(...rows);
    paintChoices();
  } catch (e) {
    if (gen === liveSGen) note.textContent = `${h.name} 열기 실패 · ${e?.message ?? e}`;
  }
}
function liveUnhideAll() {
  if (!hidden.length) return;
  const n = hidden.length; hidden = [];
  void gm.storage.set(HIDDEN_KEY, hidden).catch(() => {});
  log(`hidden channels: all ${n} shown again`);
  liveRequeue('');
  if (liveShown()) livePaint(); else paintChoices();
}
// The remote on the touch screen: channel back / forward, wrapping round like the glasses taps. With nothing on, it
// tunes in the first (or last) channel of the group on show.
function liveStep(delta) {
  if (ytLoading) return;
  if (queue?.from === 'live' && isVideo()) { void step(wrapIndex(queue.index + delta, queue.items.length) - queue.index); return; }
  const g = liveGroupNow(); if (!g.channels.length) return;
  void playFrom('live', lineOf(g), delta > 0 ? 0 : g.channels.length - 1);
}
// 0.8.13 Touchpad remote (his words: "the touchpad remote like the one on desk"): a full-screen pad over the Live tab.
// The gestures are the glasses taps on the phone screen: tap = next channel, two taps = previous, hold = captions,
// swipe right / left = next / previous, swipe down = stop (touchpad.js PAD_ACTIONS). Nothing new goes to the glasses:
// every action runs through the same liveStep / onGesture / stopAll the buttons and the glasses already use.
function padNow() {
  const it = queue?.from === 'live' && busy ? queue.items[queue.index] : null;
  $('padnow').textContent = it ? it.name : (ytLoading ? '불러오는 중…' : '없음');
}
function padAction(a) {
  const area = $('padarea');
  $('padlast').textContent = PAD_WORDS[a] || a;
  area.classList.add('hit');
  setTimeout(() => area.classList.remove('hit'), 160);
  try { navigator.vibrate?.(a === 'long' ? 40 : 15); } catch { /* no vibration here */ }
  const act = PAD_ACTIONS[a];
  if (!act) return;
  log(`touchpad: ${a} -> ${act}`);
  if (act === 'hold') { setCaptions(!captionsOn); $('padlast').textContent = `Captions ${captionsOn ? 'on' : 'off'}`; return; }
  if (act === 'stop') { if (busy) stopAll(); else $('padlast').textContent = '재생 중인 콘텐츠 없음'; return; }
  if (act === 'tap') liveStep(1); else liveStep(-1);
}
const touchpad = createTouchpad({ setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (id) => clearTimeout(id), onAction: padAction });
// 0.8.14: on a small screen (the Flip folded: the cover screen is about 350 x 390 CSS px) the touchpad opens by itself,
// so the folded phone IS the remote. A switch in Options turns it off. Unfolding leaves the pad open; Done closes it.
const smallScreen = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 600px) and (max-height: 600px)') : null;
function padAutoCheck() {
  if (!padAuto || !smallScreen?.matches || !$('touchpad').hidden) return;
  log(`small screen ${window.innerWidth}x${window.innerHeight}: touchpad opens by itself (Options > Touchpad on the cover screen)`);
  setPad(true);
}
// 0.8.15: a button's word sits in a <span> next to its icon; the icon is a <use href="#i-name"> into the sprite at the end of the page.
function label(id, text, icon) {
  const el = $(id); const span = el.querySelector('span');
  if (span) span.textContent = text; else el.textContent = text;
  if (span?.classList.contains('sr')) el.setAttribute('aria-label', text);   // 0.9.1: icon-only buttons keep a spoken name
  if (icon) el.querySelector('use')?.setAttribute('href', `#i-${icon}`);
}
function setPad(open) {
  $('touchpad').hidden = !open;
  document.body.classList.toggle('touchpad-on', open);
  if (open) { padNow(); $('padlast').textContent = '한 번은 다음 채널, 두 번은 이전 채널, 길게 누르면 자막, 아래로 밀면 정지합니다.'; }
  else touchpad.cancel();
  log(`touchpad ${open ? 'opened' : 'closed'}`);
}
// Ask the PC for the guide when the cached one is old (or missing); paint when it comes. Runs in the background at
// page load too, so the groups are there before the Live tab is ever opened.
async function tvGuideFetch(force = false) {
  if (!tvGuideOn || tvFetching) return;
  if (!force && !needsFetch(tvCache, Date.now(), tvGuideOn)) return;
  tvFetching = true;
  try {
    const g = await yt.tvGuide();
    if (!g || !Array.isArray(g.groups)) throw new Error(g?.error || 'no guide');
    tvCache = { at: Date.now(), ...trimGuide(g) }; tvPcDown = false;
    log(`TV guide: ${tvCache.groups.length} groups, ${tvCache.groups.reduce((a, x) => a + x.channels.length, 0)} channels${tvCache.pending ? `, ${tvCache.pending} Tubi names pending` : ''}`);
    const keep = cacheCopy(tvCache);  // 0.8.20: under the app's 128 KB message limit (IPTV made it ~240 KB)
    if (keep) void gm.storage.set(GUIDE_KEY, keep).catch((e) => log(`guide save: ${e?.message ?? e}`));
    if (liveShown()) livePaint();
  } catch (e) {
    tvPcDown = true; log(`TV guide: ${e?.message ?? e} (the phone's own channels still work)`);
    if (liveShown()) liveMark();
  } finally { tvFetching = false; }
}
function liveOpen() {
  usePc();
  livePaint();
  void useEngine().then(() => tvGuideFetch());
}

// ---------- jump ----------
function jumpTo(t) {
  if (!ytReady || !yt.info) return;
  if (yt.info.live) { $('ytnote').textContent = '실시간 방송에서는 재생 위치를 이동할 수 없습니다.'; return; }
  const to = Math.max(0, Math.min(t, Math.max(0, (yt.info.duration || 0) - 2)));
  if (busy && liveJump) { void liveJump(to); return; }
  if (busy) return;
  startAt = to; showPos();
  $('ytnote').textContent = `Start will begin at ${clockText(to)}.`;
}

// Called from the Start click itself: audio.play() must start inside the tap or the WebView blocks it.
function startVideo() {
  const live = isLive();
  const from = live ? 0 : startAt;
  const prevSeq = live ? (yt.info.aseq ?? 0) : 0;   // live: the PC counts sound streams; ours is the next one
  const adsDone = adBreak.finish();   // 0.8.32: the ad stops now; a card still on its way lands before the video
  hiss.stop(); tuneSent = false;   // the first picture ends the snow on the glasses
  let playing = null;
  let ended = false;       // true when the video ran to its end (not Stop, not a failure): then the next in line plays
  if (sound === 'phone' && audio) {
    if (live && needsBlobSound(yt.base)) {          // 0.8.25: phone engine (http): the stream goes in through a MediaSource
      dropSoundCopy();
      liveSound = liveSoundPick(soundFetch, yt.audioUrl());   // 0.8.29: MP4 pieces first (the app's player takes no mp3)
      if (liveSound) { audio.src = liveSound.src; log(`live phone sound: streaming as ${liveSound.kind}`); }
      else log('live phone sound: this player takes neither MP4 nor mp3 streams — pictures follow the clock');
    } else if (live) audio.src = yt.audioUrl();     // the endless stream, from where the sound is NOW (not at load)
    else { try { audio.currentTime = from; } catch { /* not seekable yet */ } }
    playing = audio.play();
  }
  const run = guarded(async () => {
    const note = $('ytnote');
    await adsDone;
    let phoneSound = false;
    if (playing) {
      try {
        if (!switchFixOn) { await playing; phoneSound = true; }
        else if ((await playWithin(playing)) === 'ok') phoneSound = true;
        else log('phone sound did not start in 8 s — pictures go on, the sound is asked for again');
      } catch (e) { log(`phone sound blocked: ${e?.message ?? e} — pictures follow the clock instead`); }
    }
    // Live: the pictures start at the second the sound began (the PC says where), phone sound or PC speakers.
    let base = 0;
    if (live) {
      const afromS = () => (yt.info.afrom || 0) / yt.info.fps;
      if (phoneSound) base = await yt.audioStart(prevSeq);
      else if (sound === 'pc') {
        try { const c = await yt.pcSound(0); base = Number.isFinite(c?.pos) && c.pos > 0 ? c.pos : afromS(); } catch (e) { log(`PC sound: ${e?.message ?? e}`); base = afromS(); }
      } else { try { await yt.status(); } catch { /* keep what we have */ } base = afromS(); }
    }
    let hold = null;                        // while a jump is prepared the video stands at this second
    let ref = { t0: clock(), at: live ? base : from };    // the clock's zero, for when no phone sound runs
    const position = () => (hold !== null ? hold
      : phoneSound && audio && !audio.paused ? base + audio.currentTime : ref.at + (clock() - ref.t0) / 1000);
    // Go to second t: stop the sound, let the PC make the stills there, then start the sound at t.
    const goTo = async (t) => {
      if (hold !== null) return;
      hold = t; lastPos = t; showPos();
      try {
        if (phoneSound && audio) audio.pause();
        if (sound === 'pc') await yt.pcStop();
        await yt.prepare(t, { onTick: (s) => { note.textContent = `Jumping to ${clockText(t)}: ${engineTag()} making stills (${Math.max(0, s.ready - Math.floor(t * s.fps))} ready)…`; } });
        if (phoneSound && audio) {
          try { audio.currentTime = t; await audio.play(); } catch (e) { phoneSound = false; log(`phone sound after jump: ${e?.message ?? e} — pictures follow the clock`); }
        }
        if (sound === 'pc') { try { await yt.pcSound(t); } catch (e) { log(`PC sound: ${e?.message ?? e}`); } }
        note.textContent = `Playing from ${clockText(t)}.`;
        log(`jump to ${clockText(t)}`);
      } catch (e) {
        note.textContent = `이동 실패 · ${e?.message ?? e}`;
        log(`jump: ${e?.message ?? e}`);
        if (phoneSound && audio) { try { await audio.play(); } catch { phoneSound = false; } }
      }
      ref = { t0: clock(), at: phoneSound && audio ? audio.currentTime : t };
      capTrack.reset();
      hold = null;
    };
    if (from > 0) {
      // Starting in the middle: the stills there must exist before the sound runs.
      hold = from;
      if (phoneSound && audio) audio.pause();
      try {
        await yt.prepare(from, { onTick: (s) => { note.textContent = `Starting at ${clockText(from)}: ${engineTag()} making stills (${Math.max(0, s.ready - Math.floor(from * s.fps))} ready)…`; } });
      } catch (e) { hold = null; throw e; }
      if (phoneSound && audio) {
        try { audio.currentTime = from; await audio.play(); } catch (e) { phoneSound = false; log(`phone sound: ${e?.message ?? e} — pictures follow the clock`); }
      }
      hold = null;
    }
    if (sound === 'pc' && !live) {
      try { await yt.pcSound(from); } catch (e) { log(`PC sound: ${e?.message ?? e}`); }
    }
    ref = { t0: clock(), at: live ? base : from };
    log(live ? `live "${yt.info.title}" from still ${Math.round(base * yt.info.fps)} — sound: ${phoneSound ? 'phone' : sound === 'pc' ? 'PC speakers' : 'off'}. Tap Stop to end.`
      : `playing "${yt.info.title}" from ${clockText(from)} — sound: ${phoneSound ? 'phone' : sound === 'pc' ? 'PC speakers' : 'off'}, captions: ${captionsOn ? (glass?.captions ? 'on' : 'phone only') : 'off'}. Tap Stop to end.`);
    note.textContent = live ? `실시간 · ${yt.info.title}` : `재생 중 · ${yt.info.title}`;
    glassStats = null;
    liveJump = live ? null : goTo;
    capTrack.enabled = captionsOn; capTrack.reset();
    yt.onStall = (what, n) => {
      const stuck = what === 'PC' ? engineWho() : `the ${what}`;
      log(`picture stalled: ${stuck} did not answer for 8 s (${n} in a row) — going on with the next still`);
      if (n >= 3) note.textContent = `Picture stuck: ${stuck} ${what === 'PC' ? 'is' : 'are'} not answering. Tap Stop, then Start — it goes on from the same place.`;
    };
    if (live) void wait(1500).then(warmNow);   // 0.9.5: the next + previous channel start getting ready now
    // 0.9.7: live sound watchdog. Sound that errors or stops moving (or never started) is asked for again; the
    // pictures stand still while it reconnects, then start from where the new sound begins.
    let watchOn = live && sound === 'phone' && !!audio && switchFixOn, watchPrev = null, tries = 0, fixing = false;
    const resound = async (why) => {
      if (fixing || !watchOn) return;
      if (tries >= SOUND_TRIES) { watchOn = false; log(`live phone sound: gave up after ${tries} tries (${why}) — pictures follow the clock`); return; }
      fixing = true; tries += 1;
      const stand = position();
      hold = stand;
      log(`live phone sound: ${why} — asking for it again (${tries} of ${SOUND_TRIES})`);
      try {
        let seq = 0;
        try { const st = await yt.status(); seq = Number.isFinite(st.aseq) ? st.aseq : 0; } catch { /* keep 0 */ }
        if (!watchOn || stopAsked) return;
        stopLiveSound();
        if (needsBlobSound(yt.base)) { liveSound = liveSoundPick(soundFetch, yt.audioUrl()); if (liveSound) audio.src = liveSound.src; }
        else audio.src = yt.audioUrl();
        if ((await playWithin(audio.play())) !== 'ok') { phoneSound = false; ref = { t0: clock(), at: stand }; return; }
        if (!watchOn || stopAsked) return;
        base = await yt.audioStart(seq);
        phoneSound = true; watchPrev = null;
        log(`live phone sound back, from still ${Math.round(base * yt.info.fps)}`);
      } catch (e) {
        phoneSound = false; ref = { t0: clock(), at: stand };
        log(`live phone sound: ${e?.message ?? e} — pictures follow the clock`);
      } finally { hold = null; fixing = false; }
    };
    const watch = watchOn ? setInterval(() => {
      if (!watchOn || fixing || stopAsked) return;
      if (!phoneSound) { void resound('the sound never started'); return; }
      const r = soundCheck(watchPrev, { now: clock(), ct: audio.currentTime, paused: audio.paused, err: liveSound?.error || '', held: hold !== null });
      watchPrev = r.next;
      if (r.stuck) void resound(r.why);
    }, SOUND_EVERY_MS) : null;
    try {
      const r = await yt.play({ position, pack, dispW: glass?.dispW ?? 600, dispH: glass?.dispH ?? 350, onFrame: showLive, picture: glassPicture(),
        captions: glass?.captions ? capTrack : null, denoise: grainOn,
        budget: busyMode === 'speed' ? BUSY_BUDGET : 0, keyEvery: busyMode === 'speed' ? BUSY_KEY_EVERY : 15, flight: flightN,
        sceneCut: cutOn ? SCENE_CUT : 0 });
      r.glassFps = glassStats ? glassStats.fps : null;
      r.at = new Date().toISOString();
      results.unshift(r); results = results.slice(0, 40); paintResults();
      void gm.storage.set(RESULTS_KEY, results).catch(() => {});
      ended = !live && !stopAsked && !yt.failure;   // a live channel does not hand over to the next one
      log(`${live ? 'Live' : loaded?.kind === 'nas' ? 'NAS' : 'YouTube'} ${r.size} ${packLabel(r.pack)} look ${r.look}: ${r.fps} stills/s sent, glasses ${r.glassFps ?? '?'} fps, ${r.skipped} skipped to stay in step${r.look === 'auto' ? `, ${r.fullStills} full-grey stills, ${r.held} held` : ''}`);
    } finally {
      watchOn = false; if (watch) clearInterval(watch);
      liveJump = null;
      startAt = stopAsked && !live ? Math.max(0, Math.floor(lastPos)) : 0;   // Stop keeps the place; the end (or live) starts over
      if (audio) audio.pause();
      stopLiveSound();
      if (sound === 'pc') await yt.pcStop();
      $('capline').textContent = '';
      note.textContent = live ? `실시간 · ${yt.info.title} · 재생을 누르면 다시 연결합니다.` : startAt > 0 ? `${clockText(startAt)}에서 정지했습니다. 재생을 누르면 이어서 재생합니다.` : `재생 준비 · ${yt.info.title} · 재생을 누르세요.`;
    }
  });
  void Promise.resolve(run).then(() => { if (ended && autoNext && !stopAsked) void step(1, true); });
}

function stopAll() { stopAsked = true; adBreak.end(); streamer.stop(); yt.stop(); if (audio) audio.pause(); stopLiveSound(); hiss.stop(); }

function wire() {
  $('ytpc').value = DEFAULT_PC;
  $('ytpc').addEventListener('change', () => { const b = cleanBase($('ytpc').value); if (b) void gm.storage.set(PCADDR_KEY, b).catch(() => {}); });
  for (const b of document.querySelectorAll('[data-size]')) b.addEventListener('click', () => {
    if (busy) return;
    const next = b.dataset.size.split('x').map(Number);
    const changed = next[0] !== size[0] || next[1] !== size[1];
    size = next; paintChoices(); preview(size[0], size[1], 0); void fontSend();
    if (changed) reloadIfLoaded('Size');
  });
  for (const b of document.querySelectorAll('[data-picture]')) b.addEventListener('click', () => { if (!busy) { picture = b.dataset.picture; void fitSend(); void fontSend(); log(`picture on glasses: ${picture}${picture === 'full' && glass && !glass.full ? ' (these glasses need version 7 for Full: Big is used)' : ''}`); paintChoices(); } });
  for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', () => { if (!busy) { sound = b.dataset.sound === 'pc' && !pcOn ? 'phone' : b.dataset.sound; paintChoices(); } });
  for (const b of document.querySelectorAll('[data-look]')) b.addEventListener('click', () => {
    if (busy || b.dataset.look === look) return;
    look = b.dataset.look; paintChoices();
    reloadIfLoaded('Look');
  });
  $('ytload').addEventListener('click', loadYoutube);
  for (const b of document.querySelectorAll('[data-show]')) b.addEventListener('click', () => { if (!ytLoading) void showsOpen(b.dataset.show); });
  for (const b of document.querySelectorAll('[data-pattern]')) b.addEventListener('click', async () => {
    if (ytLoading) return;
    if (!(await stopFirst()) || ytLoading) return;   // 0.8.8: a source tap while playing stops first
    pattern = b.dataset.pattern;
    tuck(false);
    if (pattern === 'clip' && !clipReady && !clipName && savedClip) { void loadPicked(savedClip); }
    if (pattern === 'nas' && !$('naslist').children.length) void nasOpen(nasDir);
    if (pattern === 'library') void libOpen();
    if (pattern === 'news') void newsOpen();
    if (pattern === 'live') liveOpen();
    paintChoices(); preview(size[0], size[1], 0);
  });
  // 0.9.0 the bottom tab bar + Home tiles: show a tab. Idle = it also becomes the source (the old source tap);
  // while a video plays or loads only the list on show changes, so nothing stops.
  for (const b of document.querySelectorAll('[data-view], [data-go]')) b.addEventListener('click', () => { goView(b.dataset.view || b.dataset.go); });
  $('gear').addEventListener('click', () => { sheet(true); });
  $('sheetclose').addEventListener('click', () => { sheet(false); });
  $('link').addEventListener('click', () => { const el = $('link'); el.classList.add('say'); setTimeout(() => { el.classList.remove('say'); }, 3000); });   // 0.9.1: a tap shows the words
  for (const b of document.querySelectorAll('[data-pcsub]')) b.addEventListener('click', () => {
    const next = b.dataset.pcsub === 'on'; if (next === pcOn) return;
    pcOn = next;
    if (!pcOn && sound === 'pc') sound = 'phone';
    if (!pcOn && view === 'nas') view = 'home';
    chooser.forget(); engineBase = '';
    void gm.storage.set(PCSUB_KEY, pcOn).catch(() => {});
    log(`PC subsystem: ${pcOn ? 'on (Engine, IPTV and Captions-from choices below count)' : 'off (everything on the phone)'}`);
    paintChoices();
    void useEngine();
  });
  for (const b of document.querySelectorAll('[data-pack]')) b.addEventListener('click', () => { if (!busy) { pack = b.dataset.pack; paintChoices(); } });
  for (const id of ['libshow', 'newsshow', 'liveshow']) $(id).addEventListener('click', () => { listOpen = !listOpen; paintChoices(); });
  $('nasup').addEventListener('click', () => { if (nasParent !== null) { $('nasfilter').value = ''; void nasOpen(nasParent); } });
  $('nasfilter').addEventListener('input', () => {
    clearTimeout(nasTimer);
    nasTimer = setTimeout(() => { void nasOpen(nasDir, $('nasfilter').value.trim()); }, 450);
  });
  for (const b of document.querySelectorAll('[data-jump]')) b.addEventListener('click', () => {
    jumpTo((busy ? lastPos : startAt) + Number(b.dataset.jump));
  });
  $('jumpgo').addEventListener('click', () => {
    const m = Number($('jumpmin').value);
    if (!Number.isFinite(m) || m < 0 || $('jumpmin').value.trim() === '') { $('ytnote').textContent = '이동할 위치를 분 단위로 입력하세요. 예를 들어 42를 입력하면 42분으로 이동합니다.'; return; }
    jumpTo(m * 60);
  });
  for (const b of document.querySelectorAll('[data-captions]')) b.addEventListener('click', () => {
    setCaptions(b.dataset.captions === 'on');
  });
  for (const b of document.querySelectorAll('[data-engine]')) b.addEventListener('click', () => {
    engineMode = cleanMode(b.dataset.engine);
    chooser.forget();
    paintChoices();
    void gm.storage.set(ENGINE_KEY, engineMode).catch(() => {});
    void useEngine();
  });
  for (const b of document.querySelectorAll('[data-autonext]')) b.addEventListener('click', () => {
    autoNext = b.dataset.autonext === 'on';
    paintChoices();
    void gm.storage.set(AUTONEXT_KEY, autoNext).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-covers]')) b.addEventListener('click', () => {
    coversOn = b.dataset.covers === 'on';
    void gm.storage.set(COVERS_KEY, coversOn).catch(() => {});
    paintChoices(); if (liveShown()) livePaint();
    paintYtChans();
  });
  for (const b of document.querySelectorAll('[data-ytchans]')) b.addEventListener('click', () => {
    ytChansOn = b.dataset.ytchans === 'on';
    void gm.storage.set(YTCHANS_ON_KEY, ytChansOn).catch(() => {});
    paintYtChans();
  });
  $('ytaddgo').addEventListener('click', ytAdd);
  $('ytaddurl').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ytAdd(); } });
  for (const b of document.querySelectorAll('[data-holdfav]')) b.addEventListener('click', () => {
    holdFavOn = b.dataset.holdfav === 'on';
    paintChoices();
    void gm.storage.set(HOLDFAV_KEY, holdFavOn).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-openfav]')) b.addEventListener('click', () => {
    openFav = b.dataset.openfav === 'on';
    paintChoices();
    void gm.storage.set(OPENFAV_KEY, openFav).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-tune]')) b.addEventListener('click', () => {
    tuneOn = b.dataset.tune === 'on';
    if (!tuneOn) void tuneOff();
    paintChoices();
    void gm.storage.set(TUNE_KEY, tuneOn).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-nowbar]')) b.addEventListener('click', () => {
    nowbarOn = b.dataset.nowbar === 'on';
    paintChoices();
    void gm.storage.set(NOWBAR_KEY, nowbarOn).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-padauto]')) b.addEventListener('click', () => {
    padAuto = b.dataset.padauto === 'on';
    paintChoices();
    void gm.storage.set(PADAUTO_KEY, padAuto).catch(() => {});
    padAutoCheck();
  });
  for (const b of document.querySelectorAll('[data-tapnext]')) b.addEventListener('click', () => {
    tapNextOn = b.dataset.tapnext === 'on';
    paintChoices();
    void gm.storage.set(TAPNEXT_KEY, tapNextOn).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-warm]')) b.addEventListener('click', () => {
    warmOn = b.dataset.warm === 'on';
    paintChoices();
    void gm.storage.set(WARM_KEY, warmOn).catch(() => {});
    log(`next + previous channel ready: ${warmOn ? 'on' : 'off'}`);
    void warmNow();   // off: the engine stops the background channels at once
  });
  for (const b of document.querySelectorAll('[data-switchfix]')) b.addEventListener('click', () => {
    switchFixOn = b.dataset.switchfix === 'on';
    paintChoices();
    void gm.storage.set(SWITCHFIX_KEY, switchFixOn).catch(() => {});
    log(`smooth channel switch: ${switchFixOn ? 'on' : 'off'}`);
  });
  for (const b of document.querySelectorAll('[data-tvguide]')) b.addEventListener('click', () => {
    tvGuideOn = b.dataset.tvguide === 'on';
    if (liveShown()) livePaint(); else paintChoices();
    void gm.storage.set(TVGUIDE_KEY, tvGuideOn).catch(() => {});
    if (tvGuideOn) void tvGuideFetch();
  });
  for (const b of document.querySelectorAll('[data-iptv]')) b.addEventListener('click', () => {
    iptvOn = b.dataset.iptv === 'on';
    if (liveShown()) livePaint(); else paintChoices();
    void gm.storage.set(IPTV_KEY, iptvOn).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-freefirst]')) b.addEventListener('click', () => {
    freeFirstOn = b.dataset.freefirst === 'on';
    if (queue?.from === 'live' && queue.fav) liveRequeue('');
    if (liveShown()) livePaint(); else paintChoices();
    void gm.storage.set(FREEFIRST_KEY, freeFirstOn).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-nativesound]')) b.addEventListener('click', () => {
    nativeOn = b.dataset.nativesound === 'on';
    paintChoices();
    void gm.storage.set(NATIVESOUND_KEY, nativeOn).catch(() => {});
    log(`phone sound player: ${nativeOn ? 'on (Media Link plays the phone engine sound)' : 'off (the page copies the sound)'} — load the video again`);
  });
  $('liveprev').addEventListener('click', () => liveStep(-1));
  $('livenext').addEventListener('click', () => liveStep(1));
  $('livesgo').addEventListener('click', () => { void liveSearch(); });
  $('livesq').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void liveSearch(); } });
  for (const b of document.querySelectorAll('[data-skind]')) {
    b.addEventListener('click', () => { liveSKind = b.dataset.skind; paintChoices(); if ($('livesq').value.trim()) void liveSearch(); });
  }
  $('liveedit').addEventListener('click', () => { liveEditing = !liveEditing; $('livehide').hidden = true; livePaint(); });
  $('livepad').addEventListener('click', () => setPad(true));
  $('padtop').addEventListener('click', () => setPad(true));
  smallScreen?.addEventListener?.('change', padAutoCheck);
  $('padclose').addEventListener('click', () => setPad(false));
  bindPadArea($('padarea'), touchpad);
  $('unhide').addEventListener('click', liveUnhideAll);
  // 0.9.3 (owner: "The glasses brightness make it a slider"): left end = Auto, then 1..10. Sent when the finger lifts.
  $('glowslider').max = String(GLOW_LEVELS);
  $('glowslider').addEventListener('input', () => { const v = Number($('glowslider').value); $('glowinfo').textContent = v ? `Level ${v}.` : 'Auto.'; });
  $('glowslider').addEventListener('change', () => {
    const v = Number($('glowslider').value);
    if (!Number.isInteger(v) || v < 0 || v > GLOW_LEVELS) return;
    glow = v; glowNote = '';
    if (glass && !glass.glow) { glowNote = 'These glasses need MM Video v13 (install the glasses plugin again).'; log('glasses brightness: needs glasses v13'); }
    paintChoices();
    void glowSend();
    void gm.storage.set(GLOW_KEY, glow).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-cappc]')) b.addEventListener('click', () => {
    const next = b.dataset.cappc === 'pc'; if (next === capPcOn) return;
    capPcOn = next;
    paintChoices();
    log(`captions from: ${capPcOn ? 'the PC while the phone engine plays (not IPTV)' : 'the same engine as the video'} (from the next video)`);
    void gm.storage.set(CAPPC_KEY, capPcOn).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-aicap]')) b.addEventListener('click', () => {
    aiCaps = b.dataset.aicap === 'on';
    log(`AI captions ${aiCaps ? 'on' : 'off'}`);
    paintChoices();
    void gm.storage.set(AICAP_KEY, aiCaps).catch(() => {});
    if (aiCaps && loaded && !capTrack.size) void loadCaptions(loadTurn);   // a video already on: ask now
    if (!aiCaps && capAi) {                         // stop asking; the PC stops listening by itself; the glasses clear on the next still
      capTurn += 1; capAi = false; capTrack.setCues([]); $('capline').textContent = '';
      const n = $('capnote'); n.textContent = ''; n.hidden = true;
    }
  });
  for (const b of document.querySelectorAll('[data-capfont]')) b.addEventListener('click', () => {
    const f = Number(b.dataset.capfont);
    if (!Number.isInteger(f) || f < 0 || f > 2) return;
    capFont = f; capFontNote = '';
    if (glass && !glass.font) { capFontNote = 'These glasses need MM Video v15 (install the glasses plugin again).'; log('caption letters: needs glasses v15'); }
    paintChoices();
    void fontSend();
    void gm.storage.set(CAPFONT_KEY, capFont).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-capfit]')) b.addEventListener('click', () => {
    const next = b.dataset.capfit === 'on'; if (next === capFitOn) return;
    capFitOn = next;
    paintChoices();
    void fontSend();
    void gm.storage.set(CAPFIT_KEY, capFitOn).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-awake]')) b.addEventListener('click', () => {
    const next = b.dataset.awake === 'on'; if (next === awakeOn) return;
    awakeOn = next;
    paintChoices();
    void awake.setOn(awakeOn);
    void gm.storage.set(AWAKE_KEY, awakeOn).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-iptvpc]')) b.addEventListener('click', () => {
    const next = b.dataset.iptvpc === 'on'; if (next === iptvPcOn) return;
    iptvPcOn = next;
    paintChoices();
    void gm.storage.set(IPTVPC_KEY, iptvPcOn).catch(() => {});
    log(`IPTV may use the PC: ${iptvPcOn ? 'on (Auto tries the PC when the phone fails)' : 'off (IPTV stays on the phone unless Engine is PC)'}`);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void awake.shown(); });
  for (const b of document.querySelectorAll('[data-pic]')) b.addEventListener('click', () => {
    const s = b.dataset.pic;
    if (!['sharp', 'smooth', 'retro'].includes(s)) return;
    crtOn = s !== 'sharp'; tuneOn = s === 'retro';
    if (!tuneOn) void tuneOff();
    log(`picture style ${s}`);
    paintChoices();
    void crtSend();
    if (glass && !glass.crt) log('CRT look: these glasses need version 12 (install the glasses plugin again)');
    void gm.storage.set(CRT_KEY, crtOn).catch(() => {});
    void gm.storage.set(TUNE_KEY, tuneOn).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-smooth]')) b.addEventListener('click', () => {
    const next = b.dataset.smooth === 'on'; if (next === smoothOn) return;
    smoothOn = next;
    paintChoices();
    void smoothSend();
    if (glass && !glass.smooth) log('smoothing: these glasses need MM Video v16 (install the glasses plugin again)');
    void gm.storage.set(SMOOTH_KEY, smoothOn).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-shadow]')) b.addEventListener('click', () => {
    const next = b.dataset.shadow; if (!SHADOW_LEVELS.includes(next) || next === shadowLevel) return;
    shadowLevel = next; shadowLift(shadowLevel);
    paintChoices();
    log(`dark scenes: ${shadowLevel}`);
    void gm.storage.set(SHADOW_KEY, shadowLevel).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-grain]')) b.addEventListener('click', () => {
    const next = b.dataset.grain === 'on'; if (next === grainOn) return;
    grainOn = next;
    paintChoices();
    log(`grain filter: ${grainOn ? 'on' : 'off'} (from the next start)`);
    void gm.storage.set(GRAIN_KEY, grainOn).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-busy]')) b.addEventListener('click', () => {
    const next = b.dataset.busy === 'detail' ? 'detail' : 'speed'; if (next === busyMode) return;
    busyMode = next;
    paintChoices();
    log(`busy scenes: ${busyMode} (from the next start)`);
    void gm.storage.set(BUSY_KEY, busyMode).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-flight]')) b.addEventListener('click', () => {
    const next = Number(b.dataset.flight) === 2 ? 2 : 1; if (next === flightN) return;
    flightN = next;
    paintChoices();
    log(`pictures in flight: ${flightN} (from the next start)`);
    void gm.storage.set(FLIGHT_KEY, flightN).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-scenecut]')) b.addEventListener('click', () => {
    const next = b.dataset.scenecut === 'on'; if (next === cutOn) return;
    cutOn = next;
    paintChoices();
    log(`scene cuts: ${cutOn ? 'fresh picture' : 'off'} (from the next start)`);
    void gm.storage.set(CUT_KEY, cutOn).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-fit]')) b.addEventListener('click', () => {
    const next = b.dataset.fit === 'on'; if (next === fitOn) return;
    fitOn = next;
    paintChoices();
    void fitSend(); void fontSend();
    if (glass && !glass.fit) log('fill the screen: these glasses need MM Video v17 (install the glasses plugin again)');
    void gm.storage.set(FIT_KEY, fitOn).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-crt]')) b.addEventListener('click', () => {
    crtOn = b.dataset.crt === 'on';
    paintChoices();
    void crtSend();
    if (glass && !glass.crt) log('CRT look: these glasses need version 12 (install the glasses plugin again)');
    void gm.storage.set(CRT_KEY, crtOn).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-softwhites]')) b.addEventListener('click', () => {
    if (busy) return;
    const next = b.dataset.softwhites === 'on'; if (next === softWhitesOn) return;
    softWhitesOn = next; softWhites(softWhitesOn);
    paintChoices();
    log(`softer whites: ${softWhitesOn ? 'on' : 'off'}`);
    void gm.storage.set(SOFTWHITES_KEY, softWhitesOn).catch(() => {});
    reloadIfLoaded('Softer whites');
  });
  for (const b of document.querySelectorAll('[data-saver]')) b.addEventListener('click', () => {
    saverOn = b.dataset.saver === 'on';
    paintChoices();
    void saverSend();
    void gm.storage.set(SAVER_KEY, saverOn).catch(() => {});
  });
  $('nowstop').addEventListener('click', () => { if (busy) stopAll(); });
  $('nowpick').addEventListener('click', async () => {
    if (!(await stopFirst())) return;
    view = 'home'; tuck(false); paintChoices();
    const hv = $('homeview'); if (hv && typeof hv.scrollIntoView === 'function') hv.scrollIntoView({ block: 'start' });   // 0.9.0: Home rows (the lists hide on Home)
  });
  for (const b of document.querySelectorAll('[data-bright]')) b.addEventListener('click', () => {
    const lv = brightLevel(b.dataset.bright);
    brightTame = lv === 'plain' ? false : lv;
    tameBright(brightTame === 'tame' ? true : brightTame);
    paintChoices();
    log(`bright scenes: ${lv}`);
    void gm.storage.set(BRIGHT_KEY, brightTame).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-hiss]')) b.addEventListener('click', () => {
    hissOn = b.dataset.hiss === 'on';
    if (!hissOn) hiss.stop();
    paintChoices();
    void gm.storage.set(HISS_KEY, hissOn).catch(() => {});
  });
  for (const b of document.querySelectorAll('[data-ads]')) b.addEventListener('click', () => {
    adsOn = b.dataset.ads === 'on';
    if (!adsOn) adBreak.end();
    paintChoices();
    log(`ad breaks ${adsOn ? 'on' : 'off'}`);
    void gm.storage.set(ADS_KEY, adsOn).catch(() => {});
  });
  $('clippick').addEventListener('click', () => { void pickClip(); });
  $('start').addEventListener('click', () => {
    if (busy) { stopAll(); return; }
    if (isVideo()) {
      if (!ytReady) { $('ytnote').textContent = pattern === 'library' ? 'Tap a film in the Library first.' : pattern === 'news' ? 'Tap a News item first.' : pattern === 'live' ? 'Tap a Live channel first.' : pattern === 'nas' ? 'Pick a video from the NAS list first.' : 'Load a video first: paste a link and tap Load video.'; return; }
      startVideo(); return;
    }
    if (pattern === 'clip' && !clipReady) { log('Pick a preconverted .mmv clip first (Clip).'); return; }
    void guarded(() => runOne({ w: size[0], h: size[1], pattern, pack }, true));
  });
  $('runall').addEventListener('click', () => {
    if (pattern === 'clip' && !clipReady) { log('Pick a preconverted .mmv clip first (Clip).'); return; }
    void guarded(async () => {
      const steps = plan(pattern, lz4ok(), deltaok(), skok());
      for (let i = 0; i < steps.length && !stopAsked; i += 1) {
        log(`run all: step ${i + 1} of ${steps.length}`);
        await runOne(steps[i]);
      }
    });
  });
  $('clear').addEventListener('click', () => { results = []; paintResults(); void gm.storage.set(RESULTS_KEY, results).catch(() => {}); });
}

async function main() {
  $('buildver').textContent = `v${BUILD}`;   // 0.9.1 (owner: "the video version on the top can be removed"): the version lives in Settings > Advanced
  wire(); paintChoices(); preview(size[0], size[1], 0);
  log(`build v${BUILD}`);
  await gm.ready();
  gm.plugin.onMessage(({ channel, data }) => {
    if (channel !== CHANNEL) return;
    const m = parseGlass(data);
    if (!m) return;
    if (m.type === 'tap') { taps.feed(m.action); return; }
    if (m.type === 'bright') {                           // 0.8.21: the glasses say how 56 08 went
      const what = m.level ? `Level ${m.level}` : 'Auto';
      glowNote = m.result === 0 ? `${what} set on the glasses.` : m.result === 2 ? 'These glasses do not allow brightness control.' : `The glasses refused ${what}.`;
      log(`glasses brightness ${m.level || 'Auto'}: result ${m.result}, was ${m.before || '?'}`);
      paintChoices(); return;
    }
    if (m.type === 'hello') {
      glass = m; asker.answer();
      capTrack.setLower(!!m.lower);                       // 0.8.22: v14 glasses draw lower case: captions keep it
      capFontSent = -1;                                    // 0.8.44: new glasses session: send the letters again
      void fontSend();                                     // 0.8.23: v15 glasses learn the caption letters at HELLO
      clampPack();
      void saverSend();                                    // 0.8.9: v11 glasses learn the Screensaver setting at HELLO
      void crtSend();                                      // 0.8.11: v12 glasses learn the CRT look setting at HELLO
      void smoothSend();                                   // 0.8.36: v16 glasses learn Smooth/Blocks at HELLO
      void fitSend();                                      // 0.8.41: v17 glasses learn Fill the screen at HELLO
      if (glow) void glowSend();                           // 0.8.21: v13 glasses learn a picked brightness at HELLO (Auto = nothing to change)
      openFavTry();                                        // 0.8.39: Start on open
      setStatus(`안경 연결됨 (v${m.version})`, true);
      log(`glasses v${m.version}, ${m.dispW}x${m.dispH}${m.lz4 ? ', LZ4' : ''}${m.delta ? ', Delta' : ''}${m.sk ? ', SK' : ''}${m.captions ? ', captions' : ''}${m.taps ? ', touch' : ''}${m.tune ? ', snow' : ''}${m.saver ? ', saver' : ''}${m.crt ? ', CRT' : ''}${m.glow ? ', brightness' : ''}${m.lower ? ', lower case' : ''}${m.font ? ', fonts' : ''}${m.smooth ? ', smooth' : ''}${m.fit ? ', fit' : ''}`);
      paintChoices();
    } else { glassStats = m; showGlass(); if (!glass) void asker.start(); }
  });
  gm.on('runtime.lifecycleChanged', (d) => {
    if (d?.state !== 'running') { taps.drop(); stopAll(); }
    if ((d?.state === 'running' || d?.state === 'resumed') && !glass) void asker.start();
  });
  try {   // 0.8.31: put back favorites/hidden/settings an update wiped (never over a value the phone has)
    const keys = [PCADDR_KEY, ENGINE_KEY, AUTONEXT_KEY, TUNE_KEY, HISS_KEY, ADS_KEY, BRIGHT_KEY, NOWBAR_KEY, PADAUTO_KEY, TAPNEXT_KEY, SAVER_KEY, TVGUIDE_KEY, IPTV_KEY, FREEFIRST_KEY, CRT_KEY, AICAP_KEY, CAPFONT_KEY, GLOW_KEY, SOFTWHITES_KEY, SMOOTH_KEY, SHADOW_KEY, GRAIN_KEY, BUSY_KEY, FLIGHT_KEY, FIT_KEY, HIDDEN_KEY, FAV_KEY, GROUP_KEY, OPENFAV_KEY, LASTCH_KEY, CUT_KEY, CAPPC_KEY, CAPFIT_KEY, AWAKE_KEY, IPTVPC_KEY, PCSUB_KEY, COVERS_KEY, TILEPICS_KEY, HOLDFAV_KEY, YTCHANS_KEY, YTCHANS_ON_KEY, FAVFIX_KEY, WARM_KEY, SWITCHFIX_KEY, NATIVESOUND_KEY];
    const r = await keeper.restore(keys);
    log(r.put.length ? `put back after the update: ${r.put.map((k) => k.replace('mmvideo.', '')).join(', ')}` : `favorites/settings copy: ${r.from.length ? 'nothing missing' : 'no engine answered'}`);
  } catch (e) { log(`restore: ${e?.message ?? e}`); }
  try { results = (await gm.storage.get(RESULTS_KEY))?.value || []; } catch { results = []; }
  if (!Array.isArray(results)) results = [];
  paintResults();
  try { const v = cleanBase((await gm.storage.get(PCADDR_KEY))?.value); if (v) { $('ytpc').value = v; usePc(); } } catch { /* the PC address stays */ }
  try { engineMode = cleanMode((await gm.storage.get(ENGINE_KEY))?.value); engineBase = ''; paintChoices(); } catch { /* stays Auto */ }
  try { if ((await gm.storage.get(PCSUB_KEY))?.value === true) { pcOn = true; engineBase = ''; } } catch { /* stays off: phone only */ }
  usePc(); paintChoices();
  try { const v = (await gm.storage.get(AUTONEXT_KEY))?.value; if (v === false) { autoNext = false; paintChoices(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(TUNE_KEY))?.value === false) { tuneOn = false; paintChoices(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(HISS_KEY))?.value === false) { hissOn = false; paintChoices(); } } catch { /* stays on */ }
  try { if (!ADS_PAUSED && (await gm.storage.get(ADS_KEY))?.value === false) { adsOn = false; paintChoices(); } } catch { /* stays on */ }
  try {
    const lv = brightLevel((await gm.storage.get(BRIGHT_KEY))?.value);   // 0.8.8 saved true/false; 0.9.8 'strong' / 'tame' too
    if (lv !== 'strong') { brightTame = lv === 'plain' ? false : 'tame'; tameBright(lv === 'plain' ? false : true); paintChoices(); }
  } catch { /* stays strong */ }
  try { if ((await gm.storage.get(NOWBAR_KEY))?.value === false) { nowbarOn = false; paintChoices(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(PADAUTO_KEY))?.value === false) { padAuto = false; paintChoices(); } } catch { /* stays on */ }
  padAutoCheck();
  try { if ((await gm.storage.get(TAPNEXT_KEY))?.value === false) { tapNextOn = false; paintChoices(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(WARM_KEY))?.value === false) { warmOn = false; paintChoices(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(SWITCHFIX_KEY))?.value === false) { switchFixOn = false; paintChoices(); } } catch { /* stays on */ }
  setInterval(() => { void warmNow(); }, WARM_EVERY_MS);   // 0.9.5: keeps the next + previous channel touched (or clears them)
  try { if ((await gm.storage.get(SAVER_KEY))?.value === true) { saverOn = true; paintChoices(); void saverSend(); } } catch { /* stays off */ }
  try { if ((await gm.storage.get(TVGUIDE_KEY))?.value === false) { tvGuideOn = false; paintChoices(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(IPTV_KEY))?.value === false) { iptvOn = false; paintChoices(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(FREEFIRST_KEY))?.value === false) { freeFirstOn = false; paintChoices(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(NATIVESOUND_KEY))?.value === false) { nativeOn = false; paintChoices(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(CRT_KEY))?.value === false) { crtOn = false; paintChoices(); void crtSend(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(AICAP_KEY))?.value === true) { aiCaps = true; paintChoices(); } } catch { /* stays off */ }
  try { if ((await gm.storage.get(CAPPC_KEY))?.value === false) { capPcOn = false; paintChoices(); } } catch { /* stays PC */ }
  try { const v = (await gm.storage.get(CAPFONT_KEY))?.value; if (Number.isInteger(v) && v > 0 && v <= 2) { capFont = v; paintChoices(); void fontSend(); } } catch { /* stays Classic */ }
  try { if ((await gm.storage.get(CAPFIT_KEY))?.value === false) { capFitOn = false; paintChoices(); void fontSend(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(AWAKE_KEY))?.value === false) { awakeOn = false; paintChoices(); void awake.setOn(false); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(IPTVPC_KEY))?.value === true) { iptvPcOn = true; paintChoices(); } } catch { /* stays off */ }
  try { const v = (await gm.storage.get(GLOW_KEY))?.value; if (Number.isInteger(v) && v > 0 && v <= GLOW_LEVELS) { glow = v; paintChoices(); void glowSend(); } } catch { /* stays Auto */ }
  try { if ((await gm.storage.get(SOFTWHITES_KEY))?.value === false) { softWhitesOn = false; softWhites(false); paintChoices(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(SMOOTH_KEY))?.value === false) { smoothOn = false; paintChoices(); void smoothSend(); } } catch { /* stays smooth */ }
  try { const v = (await gm.storage.get(SHADOW_KEY))?.value; if (SHADOW_LEVELS.includes(v) && v !== shadowLevel) { shadowLevel = v; shadowLift(v); paintChoices(); } } catch { /* stays normal */ }
  try { if ((await gm.storage.get(GRAIN_KEY))?.value === false) { grainOn = false; paintChoices(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(BUSY_KEY))?.value === 'detail') { busyMode = 'detail'; paintChoices(); } } catch { /* stays speed */ }
  try { if (Number((await gm.storage.get(FLIGHT_KEY))?.value) === 2) { flightN = 2; paintChoices(); } } catch { /* stays 1 */ }
  try { if ((await gm.storage.get(CUT_KEY))?.value === false) { cutOn = false; paintChoices(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(FIT_KEY))?.value === false) { fitOn = false; paintChoices(); void fitSend(); } } catch { /* stays on */ }
  try { const h = (await gm.storage.get(HIDDEN_KEY))?.value; if (Array.isArray(h)) { hidden = h.filter((x) => typeof x === 'string'); paintChoices(); } } catch { /* none hidden */ }
  let favsRead = false;
  try { const f = (await gm.storage.get(FAV_KEY))?.value; favsRead = true; if (Array.isArray(f)) { favs = f.filter((x) => x && typeof x.id === 'string').map((x) => ({ id: x.id, name: String(x.name || x.id) })); if (liveShown()) livePaint(); } } catch { /* no favorites */ }
  // 0.9.3 (owner: "Remove dazn but ad msnbc"): once; afterwards his own favorite taps rule.
  try {
    if (favsRead && (await gm.storage.get(FAVFIX_KEY))?.value !== true) {   // a failed read never overwrites his list
      const before = favs.length; favs = favFix(favs);
      await gm.storage.set(FAV_KEY, favs); await gm.storage.set(FAVFIX_KEY, true);
      log(`favorites: DAZN out, MSNBC in (${before} -> ${favs.length})`); if (liveShown()) livePaint();
    }
  } catch { /* tried again next start */ }
  try { const c = (await gm.storage.get(GUIDE_KEY))?.value; if (c && Array.isArray(c.groups)) tvCache = c; } catch { /* no cache */ }
  try { const k = (await gm.storage.get(GROUP_KEY))?.value; if (typeof k === 'string') tvGroup = k; } catch { /* first group */ }
  try { if ((await gm.storage.get(OPENFAV_KEY))?.value === false) { openFav = false; paintChoices(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(COVERS_KEY))?.value === false) { coversOn = false; paintChoices(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(HOLDFAV_KEY))?.value === false) { holdFavOn = false; paintChoices(); } } catch { /* stays on */ }
  try { if ((await gm.storage.get(YTCHANS_ON_KEY))?.value === false) ytChansOn = false; } catch { /* stays on */ }
  try { const v = (await gm.storage.get(YTCHANS_KEY))?.value; if (v !== undefined && v !== null) ytChans = cleanChans(v); } catch { /* the two shows */ }
  paintYtChans(); paintTiles();
  try { const p = (await gm.storage.get(TILEPICS_KEY))?.value; if (p && typeof p === 'object') { tilePics = p; paintTiles(); } } catch { /* plain tiles */ }
  try { const v = (await gm.storage.get(LASTCH_KEY))?.value; if (typeof v === 'string') lastCh = v; } catch { /* first favorite */ }
  openFavLoaded = true;
  if (liveShown()) livePaint();
  void useEngine().then(() => { engineReady = true; openFavTry(); return tvGuideFetch(); });   // 0.8.10: the guide loads in the background so Live opens with its groups ready; 0.8.39: then Start on open
  const fs = filesApi();
  if (fs && typeof fs.list === 'function') {
    try { savedClip = newestFile((await fs.list())?.files); if (savedClip) log(`saved clip: ${savedClip.name} (Test tools, Clip, to use)`); }
    catch (e) { log(`files list: ${e?.code ?? e?.message ?? e}`); }
  }
  setStatus('안경 연결 중…', false);
  void asker.start();
}

main().catch((e) => log(`start failed: ${e?.message ?? e}`));

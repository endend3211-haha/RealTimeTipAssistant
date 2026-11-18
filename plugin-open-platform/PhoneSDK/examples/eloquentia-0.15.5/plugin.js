// MM Eloquentia phone page: thin wiring. Rules live in core.js (tested); Media Link calls in eloqclient.js.
// Glasses mic -> this page -> Media Link on the phone (Kroko speech to text) -> cue model -> glasses.
import { createGMPlugin } from './vendor/gm-plugin-web-sdk.esm.js';
import { HudLink } from './mmhud.js';
import { VERSION, CHANNEL, encodeShades, PICKUP_MODES, FLAG_ROWS_CENTER, FrameBatcher, SessionView, buildScreen, cleanMode, makeToken, validToken, formatDuration, cleanNotes, summaryVia, keepSummary, MAX_NOTES, cueLabel, recallText, saveText, cleanRate, RECENT_CUES, micStatus, cleanStyle, cleanAbout, MAX_ABOUT, FAST_SWITCHES, petState, PET_LABEL, fastText, decodeCaps, petSend, petSay, petSide, decodeCapsNo, petNoText, encodeAsk, shouldAsk, silentWav, encodeBeat, shouldBeat, heardStop, callStarted } from './core.js';
import { createEloqClient } from './eloqclient.js';

const POLL_MS = 400;
const TICK_MS = 1000;
const MAX_QUEUE = 10;          // ~2 s of audio waiting; older batches are dropped so cues stay current

const $ = (id) => document.getElementById(id);
const logBox = $('log');
const log = (text) => { logBox.textContent = `${new Date().toLocaleTimeString()}  ${text}\n${logBox.textContent}`.slice(0, 4000); };

const gm = createGMPlugin();
const view = new SessionView();
let eloq = createEloqClient({});
let link = null;
let glass = { rows: 6, cols: 30 };
let page = 0;                  // 0.6.2: page of the newest cue on the glasses
let pageSeq = -1;              // the cue that page belongs to: a new cue starts at page 0
let pages = 1;
let running = false;
let busy = false;              // a start or stop is in progress
let mode = 'fast';
let showTranscript = false;    // look C (2026-11-11): only the cue on the glasses unless he ticks the box
let capture = null;
let glassReady = false;       // 0.6.0: Start waits until the glasses answer (HELLO, an input, or an accepted screen)
let micMode = false;          // 0.6.0: Media Link 0.9.6 records the phone mic itself, so the page may be hidden
let rate = 'normal';          // 0.6.0: cues per minute (calm / normal / max), sent to Media Link 0.9.6
let batcher = null;
let queue = [];
let inflight = false;
let pollTimer = null;
let polling = false;
let tickTimer = null;
let startedAt = 0;
let status = '';
let health = null;
let counts = { sent: 0, dropped: 0, busy: 0 };
let restartedOnce = false;
let lastScreenKey = '';
let notes = '';                // 0.3.0: prep notes, sent to Media Link (0.9.2) with every cue request
let gate = true;               // 0.3.0: smart timing, Media Link skips small talk before asking the model
let keepSum = false;           // 0.3.0: keep summaries on this phone (off by default: nothing is saved)
let summary = null;            // { text, via } of this session, or { error }
let summarising = false;
let notesTimer = null;
let cueStyle = 'character';       // 0.6.3: cue style (Media Link 0.9.8): character (default) or plain
let about = '';                // 0.6.3: About me, sent with every cue request
let aboutTimer = null;
// 0.4.0 switches (Media Link 0.9.3): fact check, word finder, web check (costs money), OpenClaw recall + save
let sw = { fact: true, word: true, web: false, recall: true, save: false, live: true, tips: true,
  stream: true, race: true, spec: true, speak: true, factcheck: true, verify: true, runsum: true, turn: true };   // 0.7.0: Media Link 0.10.0 speed + relevance   // 0.5.0: live notes + AI tips
let mem = { recall: '', memory: '', lines: 0 };   // last OpenClaw recall Media Link reported
let saveState = '';                               // '' | off | no-token | busy | pending | saved | error: ...
let savePoll = null;
const SWITCHES = ['fact', 'word', 'web', 'recall', 'save', 'live', 'tips', ...FAST_SWITCHES];
let glassPet = true;           // 0.8.0: show the pet on the glasses too (its own switch, not sent to Media Link)
let petCaps = null;            // what the glasses plugin said it can draw; null = older plugin, send nothing
let petLast = -1;              // the mood byte the glasses last got
let petSideNow = 'left';       // 0.10.0: the side she stands on in the mirror copy (the glasses start left)
const petAt = { line: 0, cue: 0, none: 0, lines: 0, nones: -1 };   // 0.7.0: when the pet last saw a sentence, a cue, a NONE
let petNo = null;              // 0.13.0: reason number when the glasses said they cannot draw her
let askTries = 0;              // 0.13.0: ASKs sent since the last reset (HELLO, coming back)
let askAt = -Infinity;
let showN = 0;                 // 0.13.0: number of the newest screen send (only that one may mark the screen as shown)
let keepAwake = true;          // 0.13.0: silent sound while listening so the phone does not pause the page
let awakeAudio = null;
let lastInCall = false;        // 0.15.0: Media Link 0.11.0 said a phone call was on at the last poll
let callTimer = null;          // 0.15.0: waits for the call to end after a call pause

/** px the glasses rows lose inside her bubble (0 = she is off, or an older glasses plugin). */
function petIndent() { return glassPet && petCaps ? petCaps.indent : 0; }
/** 0.9.0: rows the glasses can show: her bubble holds fewer than the plain screen. */
function glassRows() { return glassPet && petCaps && petCaps.rows > 0 ? Math.min(glass.rows, petCaps.rows) : glass.rows; }

function screen() {
  const c = view.cue;
  if (!c || c.seq !== pageSeq) { page = 0; pageSeq = c ? c.seq : -1; }
  const s = buildScreen({
    running, mode, cue: c, cues: view.recent(RECENT_CUES), transcript: view.transcript(), showTranscript,
    status, wallMs: running ? Date.now() - startedAt : 0, rows: glassRows(), cols: glass.cols, glass, page, indent: petIndent(),
  });
  pages = s.pages || 1;
  return s;
}

async function showGlasses(force = false) {
  if (!link) return;
  const s = screen();
  const key = JSON.stringify(s);
  if (!force && key === lastScreenKey) return;   // the link is slow: never resend an identical screen
  lastScreenKey = key;                           // set first so the 1 s tick does not queue the same screen twice
  const my = ++showN;
  // 0.14.0: the row shades go first, keyed by the seq link.show is about to use (show() takes it in the same tick)
  if (s.shades) {
    try {
      gm.plugin.sendMessage(CHANNEL, encodeShades((link.seq + 1) & 0xff, s.shades)).catch((e) => log(`shades send failed: ${e.message}`));
    } catch (e) { log(`shades send failed: ${e.message}`); }
  }
  const ok = await link.show(s).catch((e) => { log(`glasses send failed: ${e.message}`); return false; });
  // 0.13.0: a screen that did not go (page paused, link busy) is sent again on the next tick instead of being lost
  if (!ok && my === showN && lastScreenKey === key) lastScreenKey = '';
  if (ok && !glassReady) { glassReady = true; paintPage(); }   // an accepted screen means the glasses plugin is up (HELLO can be lost)
}

/** 0.13.0: ask the glasses for CAPS again (a HELLO or CAPS can be lost at start). Stops once they answer. */
async function askCaps() {
  const now = Date.now();
  if (!shouldAsk({ caps: petCaps, no: petNo, tries: askTries, lastAt: askAt, now })) return;
  askTries += 1;
  askAt = now;
  try {
    await gm.plugin.sendMessage(CHANNEL, encodeAsk());
  } catch (e) {
    log(`ask glasses: ${[e?.code, e?.message].filter(Boolean).join(' ') || e}`);
  }
}

/** 0.13.0: "still here" for glasses plugin 7, every 5 s while listening. A lost one does not matter. */
let beatAt = -Infinity;
async function beat() {
  const now = Date.now();
  if (!shouldBeat({ running, lastAt: beatAt, now })) return;
  beatAt = now;
  await gm.plugin.sendMessage(CHANNEL, encodeBeat()).catch(() => {});
}

/** 0.13.0: the page is back from the background: Media Link kept listening, so bring the glasses up to date. */
async function catchUp(why) {
  lastScreenKey = '';
  petLast = -1;
  if (!petCaps && !petNo) { askTries = 0; askAt = -Infinity; }
  if (running) await poll();
  void askCaps();
  await showGlasses(true);
  await petToGlasses();
  paintMirror();
  if (running) log(`back (${why}): glasses brought up to date`);
}

/** 0.13.0: a silent sound loops while she listens, so Android treats the page as playing and does not pause it. */
function awake(on) {
  try {
    if (on && keepAwake && micMode) {
      if (!awakeAudio) {
        awakeAudio = new Audio(URL.createObjectURL(new Blob([silentWav()], { type: 'audio/wav' })));
        awakeAudio.loop = true;
      }
      awakeAudio.play().then(() => log('keep-awake sound on'), (e) => log(`keep-awake sound: ${e?.message ?? e}`));
    } else if (awakeAudio) {
      awakeAudio.pause();
    }
  } catch (e) { log(`keep-awake sound: ${e?.message ?? e}`); }
}

/** Copies the exact screen the glasses get into the black box on the page (textContent only). */
function paintMirror() {
  const s = screen();
  $('mhead').textContent = s.header;
  $('mhead').hidden = !s.header;
  $('mrows').classList.toggle('center', Boolean(s.flags & FLAG_ROWS_CENTER));
  $('mrows').replaceChildren(...s.rows.map((r) => {
    const d = document.createElement('div');
    d.textContent = r || ' ';
    return d;
  }));
  $('mfoot').textContent = s.footer;
  const beside = petIndent() > 0;   // she is on the glasses: show her in the copy too
  $('mirror').classList.toggle('beside', beside);
  $('mirror').classList.toggle('quiet', !s.rows.some(Boolean));   // nothing to say: no bubble, like the glasses
  $('mpet').hidden = !beside;
}

function paintPage() {
  $('ver').textContent = `v${VERSION}`;
  $('gemma-token').disabled = running || busy;
  $('state').textContent = busy ? '처리 중…' : running ? '청취 중' : '청취 중지';
  $('state').classList.toggle('live', running);
  paintPet();
  $('clock').textContent = formatDuration(running ? Date.now() - startedAt : 0);
  $('clock').classList.toggle('live', running);
  $('listenlabel').textContent = running ? '청취 중지' : '청취 시작';   // only the label: the mic icon stays
  $('listen').classList.toggle('on', running);
  $('listen').disabled = busy || (!glassReady && !running);
  $('listenhint').hidden = glassReady || running;
  $('rate').value = rate;
  $('style').value = cueStyle;
  $('micmode').checked = false;
  $('micmode').disabled = true;
  $('micmode').disabled = running || busy;
  $('michint').hidden = !micMode || running;   // 0.6.1
  $('pickup').disabled = running || busy;
  for (const b of document.querySelectorAll('[data-mode]')) {
    const on = b.dataset.mode === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  $('showtx').checked = showTranscript;
  $('gate').checked = gate;
  $('keepsum').checked = keepSum;
  $('glasspet').checked = glassPet;
  $('keepawake').checked = keepAwake;
  for (const k of SWITCHES) $(`sw-${k}`).checked = sw[k];
  $('sw-web').disabled = !sw.fact;   // the web check only checks claims the fact check found
  paintMemory();
  $('notescount').textContent = `도움말을 요청할 때마다 함께 전송됩니다. ${cleanNotes($('notes').value).length} / ${MAX_NOTES}`;
  $('aboutcount').textContent = `도움말을 요청할 때마다 함께 전송됩니다. ${cleanAbout($('about').value).length} / ${MAX_ABOUT}`;
  paintSummary();
  $('status').textContent = status;
  const c = view.cue;
  $('heard').textContent = view.transcript(1200) || '…';
  // 0.6.0: the last 3 cues (newest first) in cards, and the whole session in a scrolling list
  const recent = view.recent(RECENT_CUES).reverse();
  $('recentempty').hidden = recent.length > 0;
  $('recent').replaceChildren(...recent.map((x, i) => cueItem(x, i === 0)));
  const all = view.cues.slice().reverse();
  $('earlier').hidden = all.length === 0;
  $('sessioncount').textContent = `도움말 ${all.length}개`;
  $('cues').replaceChildren(...all.map((x) => cueItem(x, false)));
  void c;
  $('stats').textContent = `sent ${counts.sent} · dropped ${counts.dropped} · phone busy ${counts.busy} · waiting ${queue.length}`
    + (health ? ` · Media Link heard ${health.audioSec ?? 0} s` : '');
  paintHealth();
  paintMirror();
}

function cueItem(x, newest) {
  const li = document.createElement('li');
  if (newest) li.className = 'newest';
  li.dataset.kind = x.kind;
  const k = document.createElement('span'); k.className = `kind k-${x.kind}`; k.textContent = cueLabel(x);
  const t = document.createElement('span'); t.className = 'text'; t.textContent = x.text;
  const src = document.createElement('span'); src.className = 'src'; src.textContent = `${x.via} · ${x.ms} ms`;
  li.append(k, t, src);
  return li;
}

function paintSummary() {
  const heardSome = view.transcript(10).trim().length > 0;
  $('sumbox').hidden = running || (!heardSome && !summary);
  $('summake').disabled = busy || summarising || running || !heardSome;
  $('summake').textContent = summarising ? '요약 만드는 중…' : summary?.text ? '요약 다시 만들기' : '요약 만들기';
  if (summarising) $('sumtext').textContent = '휴대폰에서 Gemma로 요약 중…';
  else if (summary?.text) $('sumtext').textContent = summary.text;
  else if (summary?.error) $('sumtext').textContent = `요약 실패 · ${summary.error}`;
  else $('sumtext').textContent = '요약 만들기를 누르면 대화의 핵심, 숫자, 남은 질문이 정리됩니다.';
  $('sumvia').textContent = summary?.text ? (summary.r?.via === 'Gemma 2' ? 'Gemma 2 · 휴대폰' : summaryVia(summary.r)) + (summary.kept ? ' · kept on this phone' : '') : '';
  const st = summary?.text && sw.save ? saveText(saveState) : '';
  $('sumsave').textContent = st;
  $('sumsave').hidden = !st;
}

/** What OpenClaw remembered for this talk (Media Link asks it at Start when recall is on). */
function paintMemory() {
  const show = sw.recall && (running || mem.recall || mem.memory);
  $('membox').hidden = !show;
  if (!show) return;
  $('memstate').textContent = recallText(mem.recall);
  $('memstate').hidden = mem.recall === 'ok' && Boolean(mem.memory);   // the heading already says it
  $('memtext').textContent = mem.memory || '';
  $('memtext').hidden = !mem.memory;
}

/** Keeps the OpenClaw recall + save state from any Media Link reply that carries it (older Media Link: no fields). */
function takeMemory(r) {
  if (!r || typeof r !== 'object') return;
  if (typeof r.recall === 'string') mem.recall = r.recall;
  if (typeof r.memory === 'string') mem.memory = r.memory;
  if (typeof r.memoryLines === 'number') mem.lines = r.memoryLines;
  if (typeof r.save === 'string' && saveState) saveState = r.save;   // only after a summary asked for a save
}

/** 0.8.0: her face (pet.css plays the mood) and her speech bubble: the cue on show is her line. */
function paintPet() {
  const st = petState({ running, busy, now: Date.now(), lineAt: petAt.line, cueAt: petAt.cue, noneAt: petAt.none });
  const pet = $('pet');
  const bubble = $('petsay');
  const say = petSay(st, running ? view.cue : null);
  if (bubble.textContent !== say) bubble.textContent = say;
  bubble.classList.toggle('says', say !== PET_LABEL[st]);
  void petToGlasses(st);
  if (pet.dataset.state === st) return;
  pet.dataset.state = st;
  pet.className = `pet ${st}`;
  pet.setAttribute('aria-label', `Eloquentia: ${PET_LABEL[st]}`);
  $('mpet').className = `pet mpet ${st}`;
  petSideNow = petSide(st, petSideNow);   // 0.10.0: she stands where her lean puts her, like on the glasses
  $('mirror').classList.toggle('right', petSideNow === 'right');
  $('petrow').classList.toggle('right', petSideNow === 'right');   // 0.11.0: the phone row follows her too
}

/** 0.8.0: the mood to the glasses, only when it changed and only to a glasses plugin that said it has the pet. */
async function petToGlasses(st = $('pet').dataset.state || 'idle') {
  const bytes = petSend({ caps: petCaps, show: glassPet, state: st, last: petLast });
  if (!bytes) return;
  const before = petLast;
  petLast = bytes[2];   // set first: paint runs every second and must not queue the same byte twice
  try {
    await gm.plugin.sendMessage(CHANNEL, bytes);
  } catch (e) {
    if (petLast === bytes[2]) petLast = before;   // try again on the next paint
    log(`pet to glasses: ${[e?.code, e?.message].filter(Boolean).join(' ') || e}`);
  }
}

/** 0.7.0: what changed in a Media Link state reply, for the pet. */
function petSee(s, got) {
  const now = Date.now();
  if (got.lines) petAt.line = now;
  if (got.cues) petAt.cue = now;
  if (typeof s.noneCount === 'number') {
    if (petAt.nones >= 0 && s.noneCount > petAt.nones) petAt.none = now;
    petAt.nones = s.noneCount;
  }
}

function paintHealth() {
  const el = $('ml');
  if (!health) { el.textContent = 'Media Link 연결 확인 전'; el.classList.remove('ok', 'warn'); return; }
  const keys = `Fast key ${health.hasFastKey ? 'saved' : 'NOT SET'} · Careful key ${health.hasCarefulKey ? 'saved' : 'NOT SET'}`;
  el.textContent = `Media Link ${health.version || '?'} · 음성 인식 모델 ${health.loaded ? '준비됨' : '준비 중'} · ${keys}${health.error ? ` · ${health.error}` : ''}`;
  const keyOk = mode === 'careful' ? health.hasCarefulKey : (health.hasFastKey || (sw.stream && health.hasGroqKey));   // 0.7.0: Groq alone works when streaming
  const good = Boolean(health.ok && !health.error && keyOk);
  el.classList.toggle('ok', good);
  el.classList.toggle('warn', !good);
  if (health.ok && !keyOk) el.textContent += ` · type the ${mode === 'careful' ? 'Claude' : 'Groq or Cerebras'} key on the Media Link screen`;
  const fast = fastText(health);   // 0.7.0: Groq key + race counts (Media Link 0.10.0)
  $('mlfast').textContent = fast;
  $('mlfast').hidden = !fast;
}

async function paint(forceGlasses = false) { paintPage(); await showGlasses(forceGlasses); }

const act = (fn) => Promise.resolve().then(fn).then(() => paint()).catch((e) => { status = e.message; log(`failed: ${e.message}`); return paint(); });

// ---------- audio out ----------
function enqueue(bodies) {
  for (const b of bodies) {
    queue.push(b);
    if (queue.length > MAX_QUEUE) { queue.shift(); counts.dropped += 1; }
  }
  void drain();
}

async function drain() {
  if (inflight) return;
  inflight = true;
  try {
    while (queue.length && running) {
      const body = queue.shift();
      try {
        await eloq.audio(body);
        counts.sent += 1;
      } catch (e) {
        if (e.status === 503) { counts.busy += 1; counts.dropped += 1; continue; }
        if (e.status === 409 && !restartedOnce) {          // Media Link restarted under us: start once more
          restartedOnce = true;
          log('Media Link was not running a session, starting again');
          await sendConfig(true);
          const r = await eloq.start(mode, micMode).catch((x) => { log(`restart failed: ${x.message}`); return null; });
          if (r) { view.merge(r); takeMemory(r); }
          continue;
        }
        counts.dropped += 1;
        status = e.message;
        log(`audio: ${e.message}`);
        if (e.code === 'OFFLINE') await new Promise((r) => setTimeout(r, 500));
      }
    }
  } finally { inflight = false; }
}

async function pump(cap) {
  const reader = cap.stream.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (capture === cap && running) enqueue(batcher.push(value));
    }
    if (capture === cap) await act(() => finish('the phone ended the microphone stream'));
  } catch (e) {
    if (capture === cap) await act(() => finish(`microphone stream error: ${e.message}`));
  }
}

// ---------- state in ----------
async function poll() {
  if (polling || !running) return;
  polling = true;
  try {
    const s = await eloq.state(view.since);
    health = s;
    takeMemory(s);
    const got = view.merge(s);
    petSee(s, got);
    if (view.restarted) log('Media Link session restarted');
    if (got.cues) log(`cue: ${view.cues[view.cues.length - 1].text}`);
    // 0.15.0: he says "stop listening" -> pause; a double-tap or Start resumes
    if (got.lines && running && !busy && heardStop(view.lines.slice(-got.lines))) {
      polling = false;
      await act(() => finish('Paused: you said stop. Double-tap or Start to listen again'));
      return;
    }
    // 0.15.0: a phone call starts (Media Link 0.11.0 inCall) -> pause, and listen again once the call ends
    const call = callStarted(lastInCall, s);
    lastInCall = s.inCall === true;
    if (call && running && !busy) {
      polling = false;
      await act(() => finish('Paused: phone call. Listening again after the call'));
      watchCall();
      return;
    }
    if (s.running === false && running && !busy && micMode) {
      polling = false;
      await act(() => finish(s.micError ? `Media Link: ${s.micError}` : 'Media Link stopped listening (Stop in its notification?)'));
      return;
    }
    const before = status;
    if (s.running === false && running && !busy) status = 'Media Link stopped listening';
    else if (status.startsWith('Media Link is not running') || status.startsWith('Media Link did not')) status = '';
    status = micStatus(status, s, micMode);   // 0.6.1: "Android muted the mic" from Media Link 0.9.7
    if (got.cues || got.lines || status !== before || view.partial !== $('heard').dataset.partial) {
      $('heard').dataset.partial = view.partial;
      await paint();
    }
  } catch (e) {
    status = e.message;
  } finally { polling = false; }
}

/** 0.15.0: after a call pause, ask Media Link every 3 s and start again once the call is over (at most ~3 hours). */
function watchCall(n = 0) {
  clearTimeout(callTimer);
  callTimer = null;
  if (n >= 3600 || running) return;
  callTimer = setTimeout(async () => {
    callTimer = null;
    let s = null;
    try { s = await eloq.state(view.since); } catch { /* Media Link busy or gone: try again */ }
    if (running || busy) return;
    if (s && s.inCall === false) { log('call ended: listening again'); await act(() => begin()); return; }
    watchCall(n + 1);
  }, 3000);
}

// ---------- start / stop ----------
async function begin() {
  if (running || busy) return;
  clearTimeout(callTimer); callTimer = null;   // 0.15.0: a manual start ends the wait for the call to end
  busy = true;
  restartedOnce = false;
  try {
    if (!validToken($('gemma-token').value.trim())) throw new Error('Memo 로컬 대화의 연결 코드를 입력하세요.');
    const pickupMode = PICKUP_MODES.includes($('pickup').value) ? $('pickup').value : 'meetingAuto';
    mem = { recall: '', memory: '', lines: 0 };
    saveState = '';
    clearTimeout(savePoll); savePoll = null;
    await sendConfig(true);
    const r = await eloq.start(mode, micMode);
    lastInCall = r.inCall === true;   // 0.15.0: starting during a call is his choice: only a NEW call pauses
    health = { ...health, ...r };
    takeMemory(r);
    view.reset();
    Object.assign(petAt, { line: 0, cue: 0, none: 0, lines: 0, nones: -1 });
    view.merge(r);
    if (!r.loaded && r.error) throw new Error(`speech model: ${r.error}`);
    if (mode === 'fast' && !r.hasFastKey && !(sw.stream && r.hasGroqKey)) status = 'No Groq or Cerebras key on Media Link: transcript only';
    else if (mode === 'careful' && !r.hasCarefulKey) status = 'No Claude key on Media Link: transcript only';
    else status = '';
    summary = null;
    batcher = new FrameBatcher();
    queue = [];
    counts = { sent: 0, dropped: 0, busy: 0 };
    if (micMode && r.mic !== true) throw new Error('Media Link 0.9.6 or newer is needed to listen with the phone mic');
    if (micMode && r.micError) throw new Error(`Media Link: ${r.micError}`);
    if (!micMode) capture = await gm.audio.openCapture({ profile: 'balanced', pickupMode });
    running = true;
    startedAt = Date.now();
    log(micMode ? `listening with the phone mic (${mode}, ${rate})` : `listening (${pickupMode}, ${mode}, ${rate})`);
    if (!micMode) void pump(capture);
    pollTimer = setInterval(() => { void poll(); }, POLL_MS);
    tickTimer = setInterval(() => { if (running) void paint(); }, TICK_MS);
    awake(true);
  } catch (e) {
    await eloq.stop().catch(() => {});
    throw e;
  } finally { busy = false; }
}

async function finish(reason) {
  if (!running) return;
  busy = true;
  const cap = capture;
  capture = null;
  try {
    const last = batcher?.flush();
    if (last) enqueue([last]);
    await drain();
    running = false;
    clearInterval(pollTimer); pollTimer = null;
    clearInterval(tickTimer); tickTimer = null;
    try { if (cap) { const r = await cap.stop(); log(`mic stopped: ${r.frameCount} frames, ${r.droppedFrameCount} dropped`); } } catch (e) { log(`mic stop: ${e.message}`); }
    try {
      const r = await eloq.stop(); view.merge(r);
      health = r;
    } catch (e) { log(`Media Link stop: ${e.message}`); }
    status = reason;
    log(reason);
  } finally { running = false; busy = false; awake(false); }
}

/** Notes, smart timing, the 0.4.0 switches and the 0.6.3 style + About me to Media Link. An older Media Link ignores what it does not know. */
async function sendConfig(required = false) {
  try {
    const r = await eloq.config({ gate, rate, style: cueStyle, fact: false, word: false, web: false, recall: false, save: false, live: false, tips: false });
    health = { ...health, ...r };
  } catch (e) {
    if (required) throw new Error('Media Link의 외부 기능 끄기 설정을 적용하지 못했습니다. ' + e.message);
    log(`settings to Media Link: ${e.message}`);
  }
}

async function makeSummary() {
  if (running || summarising) return;
  summarising = true;
  paintPage();
  try {
    const r = await eloq.summary();
    if (!r.ok) { summary = { error: r.error || 'the model gave no answer' }; return; }
    summary = { text: r.summary, r, kept: false };
    log(`summary by ${r.via} in ${r.ms} ms`);
    saveState = typeof r.saved === 'string' ? r.saved : '';   // Media Link 0.9.2 has no "saved": nothing to show
    if (saveState === 'pending') watchSave(0);
    if (keepSum) {
      let list = [];
      try { list = JSON.parse((await gm.storage.get('eloq_summaries'))?.value || '[]'); } catch { list = []; }
      await gm.storage.set('eloq_summaries', JSON.stringify(keepSummary(list, r.summary, Date.now())));
      summary.kept = true;
    }
  } catch (e) {
    summary = { error: e.status === 404 ? 'Media Link 0.9.2 or newer is needed' : e.message };
  } finally { summarising = false; }
}

/** The OpenClaw save finishes after the summary: ask /eloq/state a few times until it says saved or why not. */
function watchSave(n) {
  clearTimeout(savePoll);
  if (n >= 30 || running) return;   // ~60 s; OpenClaw writing a file is slow
  savePoll = setTimeout(async () => {
    try { takeMemory(await eloq.state(view.since)); } catch { /* keep the last word */ }
    paintPage();
    if (saveState === 'pending') watchSave(n + 1);
  }, 2000);
}

async function setMode(m) {
  const next = cleanMode(m);
  if (next === mode) return;
  mode = next;
  await gm.storage.set('eloq_mode', mode).catch(() => {});
  if (running) {
    const r = await eloq.mode(mode);
    health = { ...health, ...r };
    log(`mode: ${mode}`);
  }
}

function onGlassInput(name) {
  if (name === 'DOUBLE_TAP') return act(() => (running ? finish('stopped on the glasses') : begin()));
  // 0.6.2: tap = next page of a long cue; tap on the last page = clear it
  if (name === 'TAP' && view.cue) return act(() => { if (page < pages - 1) page += 1; else { view.hideCue(); page = 0; } });
  return null;
}

async function checkHealth() {
  try { health = await eloq.health(); } catch (e) { health = null; $('ml').textContent = `Media Link: ${e.message}`; }
  paintPage();
  if (!health) $('ml').textContent = 'Media Link에 연결할 수 없습니다. Memo 로컬 대화에서 MM Eloquentia 연결 시작을 누르세요.';
}

async function loadSettings() {
  const get = async (k) => { try { return (await gm.storage.get(k))?.value; } catch { return undefined; } };
  let token = await get('eloq_token');
  if (!validToken(token)) {
    token = makeToken(crypto.getRandomValues(new Uint8Array(32)));
    await gm.storage.set('eloq_token', token).catch(() => {});
  }
  const localCode = await get('eloq_local_code');
  $('gemma-token').value = validToken(localCode) ? localCode : '';
  eloq = createEloqClient({ token: $('gemma-token').value });
  mode = cleanMode(await get('eloq_mode'));
  const tx = await get('eloq_show');
  showTranscript = tx === undefined || tx === null ? false : Boolean(tx);
  const n = await get('eloq_notes');
  notes = typeof n === 'string' ? n.slice(0, MAX_NOTES) : '';
  $('notes').value = notes;
  const ab = await get('eloq_about');
  about = typeof ab === 'string' ? ab.slice(0, MAX_ABOUT) : '';
  $('about').value = about;
  cueStyle = cleanStyle(await get('eloq_style'));
  const g = await get('eloq_gate');
  gate = g === undefined || g === null ? true : Boolean(g);
  keepSum = Boolean(await get('eloq_keepsum'));
  const gp = await get('eloq_glasspet');
  glassPet = gp === undefined || gp === null ? true : Boolean(gp);
  const ka = await get('eloq_keepawake');
  keepAwake = ka === undefined || ka === null ? true : Boolean(ka);
  for (const k of SWITCHES) {
    const v = await get(`eloq_${k}`);
    if (v !== undefined && v !== null) sw[k] = Boolean(v);
  }
  rate = cleanRate(await get('eloq_rate'));
  micMode = false;
  const pick = await get('eloq_pickup');
  if (PICKUP_MODES.includes(pick)) $('pickup').value = pick;
}

async function start() {
  await gm.ready();
  await loadSettings();
  link = new HudLink({ gm, channel: CHANNEL, log });
  link.start({
    onHello: (g) => {
      glass = { rows: g.rows || 6, cols: g.cols || 30, width: g.width || 0, lineHeight: g.lineHeight || 0 };
      glassReady = true;
      $('link').textContent = `안경 연결됨 · ${glass.rows}줄 × 약 ${glass.cols}자`;
      $('link').classList.add('ok');
      if (!petCaps && !petNo) { askTries = 0; askAt = -Infinity; }   // 0.13.0: a fresh HELLO, so ask again if CAPS stays away
      petLast = -1;   // 0.13.0: a HELLO means the glasses drew a notice (PHONE PAUSED) or restarted: send her mood again
      void paint(true);
    },
    onInput: ({ name }) => { glassReady = true; void onGlassInput(name); },
  });
  // 0.8.0: a glasses plugin with the pet says so after every HELLO (it has just started or resumed: its pet is hidden)
  gm.plugin.onMessage(({ channel, data }) => {
    if (channel !== CHANNEL) return;
    const no = decodeCapsNo(data);   // 0.13.0: glasses plugin 6 says why she cannot be drawn
    if (no !== null) {
      if (petNo !== no) log(`glasses pet unavailable: ${petNoText(no)} (reason ${no})`);
      const had = petCaps;
      petNo = no;
      petCaps = null;
      if (had) void showGlasses().then(() => paintMirror());   // the rows get their full width back
      return;
    }
    const caps = decodeCaps(data);
    if (!caps) return;
    petNo = null;
    if (!petCaps) log(`glasses pet: ${caps.width}x${caps.height}, ${caps.moods} moods`);
    petCaps = caps;
    petLast = -1;
    // the screen broken to fit her bubble first, then she appears under it
    void showGlasses().then(() => petToGlasses()).then(() => paintMirror());
  });
  await paint(true);
  void checkHealth();
  // hiding or suspending the page stops the phone's audio: say so plainly instead of pretending it still listens
  // 0.6.0: in phone-mic mode Media Link keeps listening on its own, so hiding the page does not stop it
  // 0.13.0: back from the background, the glasses get what they missed
  gm.on('runtime.lifecycleChanged', (d) => {
    if (d.state === 'running') void catchUp('page resumed').catch((e) => log(`catch up: ${e.message}`));
    else if (!micMode) void act(() => finish('page hidden or suspended'));
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void catchUp('page shown').catch((e) => log(`catch up: ${e.message}`));
    else if (!micMode) void act(() => finish('page hidden'));
  });
  setInterval(() => { void askCaps(); void beat(); }, 1000);   // 0.13.0: ASK until CAPS comes (at most 6, 5 s apart); BEAT every 5 s while listening
  watchConnection();
}

/** 0.6.0: the glasses dropping the link stops the session with a plain message (device.events, connection). */
function watchConnection() {
  try {
    gm.device?.onConnection?.((e) => {
      if (e?.connected !== false) return;
      glassReady = false;
      petLast = -1;   // the glasses hide the pet when the link drops; they say CAPS again when it is back
      $('link').textContent = '안경 연결이 끊겼습니다.';
      $('link').classList.remove('ok');
      void act(() => finish('glasses disconnected'));
    });
    Promise.resolve(gm.device?.subscribeEvents?.(['connection'])).catch((e) => log(`connection events: ${e?.message ?? e}`));
  } catch (e) { log(`connection events: ${e?.message ?? e}`); }
}

$('listen').addEventListener('click', () => { void act(() => (running ? finish('stopped on the phone') : begin())); });
for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => { void act(() => setMode(b.dataset.mode)); });
$('showtx').addEventListener('change', () => { void act(async () => { showTranscript = $('showtx').checked; await gm.storage.set('eloq_show', showTranscript).catch(() => {}); }); });
$('pickup').addEventListener('change', () => { void gm.storage.set('eloq_pickup', $('pickup').value).catch(() => {}); });
$('gemma-token').addEventListener('change', () => {
  if (running || busy) return;
  const token = $('gemma-token').value.trim();
  eloq = createEloqClient({ token });
  void gm.storage.set('eloq_local_code', token).catch(() => {});
  void checkHealth();
});
$('check').addEventListener('click', () => { void checkHealth(); });
$('rate').addEventListener('change', () => { void act(async () => { rate = cleanRate($('rate').value); await gm.storage.set('eloq_rate', rate).catch(() => {}); if (running) await sendConfig(); }); });
$('style').addEventListener('change', () => { void act(async () => { cueStyle = cleanStyle($('style').value); await gm.storage.set('eloq_style', cueStyle).catch(() => {}); if (running) await sendConfig(); }); });
$('micmode').addEventListener('change', () => { void act(async () => { micMode = $('micmode').checked; await gm.storage.set('eloq_mic', micMode).catch(() => {}); }); });
$('gate').addEventListener('change', () => { void act(async () => { gate = $('gate').checked; await gm.storage.set('eloq_gate', gate).catch(() => {}); if (running) await sendConfig(); }); });
for (const k of SWITCHES) {
  $(`sw-${k}`).addEventListener('change', () => {
    void act(async () => {
      sw[k] = $(`sw-${k}`).checked;
      await gm.storage.set(`eloq_${k}`, sw[k]).catch(() => {});
      if (running) await sendConfig();
    });
  });
}
$('glasspet').addEventListener('change', () => { void act(async () => { glassPet = $('glasspet').checked; await gm.storage.set('eloq_glasspet', glassPet).catch(() => {}); await showGlasses(); await petToGlasses(); paintMirror(); }); });
$('keepawake').addEventListener('change', () => { void act(async () => { keepAwake = $('keepawake').checked; await gm.storage.set('eloq_keepawake', keepAwake).catch(() => {}); awake(running); }); });
$('keepsum').addEventListener('change', () => { void act(async () => { keepSum = $('keepsum').checked; await gm.storage.set('eloq_keepsum', keepSum).catch(() => {}); }); });
$('notes').addEventListener('input', () => {
  notes = $('notes').value.slice(0, MAX_NOTES);
  $('notescount').textContent = `도움말을 요청할 때마다 함께 전송됩니다. ${cleanNotes(notes).length} / ${MAX_NOTES}`;
  clearTimeout(notesTimer);   // save + send once he stops typing
  notesTimer = setTimeout(() => { void gm.storage.set('eloq_notes', notes).catch(() => {}); if (running) void sendConfig(); }, 800);
});
$('about').addEventListener('input', () => {
  about = $('about').value.slice(0, MAX_ABOUT);
  $('aboutcount').textContent = `도움말을 요청할 때마다 함께 전송됩니다. ${cleanAbout(about).length} / ${MAX_ABOUT}`;
  clearTimeout(aboutTimer);   // save + send once he stops typing
  aboutTimer = setTimeout(() => { void gm.storage.set('eloq_about', about).catch(() => {}); if (running) void sendConfig(); }, 800);
});
$('summake').addEventListener('click', () => { void act(() => makeSummary()); });
$('clear').addEventListener('click', () => { void act(() => { view.hideCue(); page = 0; }); });

start().catch((e) => { $('link').textContent = `시작 실패 · ${e.message}`; log(`start failed: ${e.stack ?? e.message}`); });

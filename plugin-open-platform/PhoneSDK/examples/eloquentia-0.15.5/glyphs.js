// glyphs.js - real advance widths (px) of the two glasses fonts, read from the official MemoMind app's
// liblv_font.so on 2026-11-07 (no kerning, letter space 0). FONT 'default' = line height 34, 'large' = 41.
// Which LVGL font is which is INFERRED from those line heights, NOT proven on the glasses:
// artifacts/memomind-textprobe measures it on the real lens. Pure module: no DOM, no I/O.

const DEFAULT_ASCII = [7,6,8,16,13,19,16,4,7,7,10,14,6,10,6,9,14,9,13,14,14,14,14,12,14,14,6,6,14,14,14,11,19,15,15,16,17,14,13,17,16,5,11,15,13,20,17,18,14,18,14,14,14,16,15,22,14,14,14,8,8,8,10,10,6,12,14,12,14,13,8,14,13,6,6,12,6,20,13,13,14,14,9,11,8,13,12,18,11,12,11,8,5,8,12]; // U+0020..U+007E
const DEFAULT_EXTRA = {160:7,161:6,162:13,163:14,164:15,165:13,166:5,167:15,168:9,169:20,170:8,171:14,172:14,173:10,174:13,175:7,176:9,177:14,178:8,179:8,180:6,181:13,182:16,183:12,184:6,185:6,186:8,187:14,188:18,189:20,190:20,191:11,192:15,193:15,194:15,195:15,196:15,197:15,198:23,199:16,200:14,201:14,202:14,203:14,204:5,205:5,206:5,207:5,208:17,209:17,210:18,211:18,212:18,213:18,214:18,215:14,216:18,217:16,218:16,219:16,220:16,221:14,222:15,223:14,224:12,225:12,226:12,227:12,228:12,229:12,230:21,231:12,232:13,233:13,234:13,235:13,236:5,237:5,238:5,239:5,240:13,241:13,242:13,243:13,244:13,245:13,246:13,247:14,248:13,249:13,250:13,251:13,252:13,253:12,254:14,255:12,8211:12,8212:21,8216:6,8217:6,8220:9,8221:9,8226:23,8230:23,8364:14,8482:18,8592:23,8593:23,8594:23,8595:23};
const LARGE_ASCII = [8,8,10,21,17,24,20,6,9,9,13,17,7,13,7,11,18,11,16,17,17,17,17,15,18,17,7,7,17,17,17,14,24,19,19,20,22,17,17,21,21,7,14,19,16,25,21,23,18,23,18,18,17,20,19,28,18,18,17,10,10,10,13,13,7,16,17,15,17,16,10,17,17,7,7,15,7,26,17,17,17,17,11,14,10,17,15,23,14,15,14,10,6,10,15]; // U+0020..U+007E
const LARGE_EXTRA = {160:8,161:8,162:17,163:17,164:18,165:17,166:6,167:19,168:11,169:26,170:10,171:18,172:17,173:13,174:16,175:9,176:12,177:17,178:10,179:10,180:7,181:17,182:20,183:15,184:8,185:7,186:10,187:18,188:23,189:25,190:26,191:14,192:19,193:19,194:19,195:19,196:19,197:19,198:29,199:20,200:17,201:17,202:17,203:17,204:7,205:7,206:7,207:7,208:22,209:21,210:23,211:23,212:23,213:23,214:23,215:17,216:22,217:20,218:20,219:20,220:20,221:18,222:19,223:17,224:16,225:16,226:16,227:16,228:16,229:16,230:26,231:15,232:16,233:16,234:16,235:16,236:6,237:6,238:6,239:6,240:16,241:17,242:17,243:17,244:17,245:17,246:17,247:17,248:17,249:17,250:17,251:17,252:17,253:15,254:17,255:15,8211:16,8212:26,8216:7,8217:7,8220:11,8221:11,8226:29,8230:29,8364:18,8482:22,8592:28,8593:28,8594:29,8595:28};

export const FONTS = Object.freeze({
  default: Object.freeze({ lineHeight: 34, fallback: 23, ascii: DEFAULT_ASCII, extra: DEFAULT_EXTRA }),
  large: Object.freeze({ lineHeight: 41, fallback: 27, ascii: LARGE_ASCII, extra: LARGE_EXTRA }),
});

function fontOf(font) { return FONTS[font] || FONTS.default; }

/** Advance width of one character (a code point) in px; unknown characters count as the font's widest box. */
export function charWidth(ch, font = 'default') {
  const f = fontOf(font);
  const cp = String(ch).codePointAt(0);
  if (cp >= 32 && cp < 127) return f.ascii[cp - 32];
  const w = f.extra[cp];
  return w === undefined ? f.fallback : w;
}

/** Width in px of a single line of text, as LVGL measures it (sum of advances). */
export function textWidth(text, font = 'default') {
  let total = 0;
  for (const ch of String(text == null ? '' : text)) total += charWidth(ch, font);
  return total;
}

/** Cut one word that is wider than a line into pieces that fit (the only place a word is ever cut). */
function splitWord(word, maxPx, font) {
  const pieces = [];
  let piece = '';
  let width = 0;
  for (const ch of word) {
    const w = charWidth(ch, font);
    if (piece && width + w > maxPx) { pieces.push(piece); piece = ''; width = 0; }
    piece += ch;
    width += w;
  }
  if (piece) pieces.push(piece);
  return pieces;
}

/**
 * Greedy wrap by real pixel width: as many whole words per line as fit in maxPx, breaking only at
 * spaces. A word wider than a whole line is the only thing ever cut. Nothing is dropped: the caller
 * pages the lines instead of truncating. Newlines in the text start a new line.
 */
export function wrapPx(text, maxPx, font = 'default') {
  const limit = Math.max(1, Math.floor(Number(maxPx) || 0));
  const space = charWidth(' ', font);
  const lines = [];
  for (const para of String(text == null ? '' : text).split(/\r?\n/)) {
    const words = para.split(/[ \t]+/).filter(Boolean);
    let line = '';
    let width = 0;
    for (const word of words) {
      const ww = textWidth(word, font);
      if (!line) {
        if (ww <= limit) { line = word; width = ww; continue; }
        const pieces = splitWord(word, limit, font);
        lines.push(...pieces.slice(0, -1));
        line = pieces[pieces.length - 1];
        width = textWidth(line, font);
      } else if (width + space + ww <= limit) {
        line += ' ' + word;
        width += space + ww;
      } else {
        lines.push(line);
        if (ww <= limit) { line = word; width = ww; continue; }
        const pieces = splitWord(word, limit, font);
        lines.push(...pieces.slice(0, -1));
        line = pieces[pieces.length - 1];
        width = textWidth(line, font);
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** True when a glasses HELLO says the screen is the one these tables were measured for. */
export function glassMatchesTables(glass, font = 'default') {
  if (!glass) return true; // the real phone never sees HELLO: assume the known 600x350 lens
  const width = Number(glass.width) || 0;
  const lineHeight = Number(glass.lineHeight) || 0;
  if (width && width !== 600) return false;
  if (lineHeight && lineHeight !== fontOf(font).lineHeight) return false;
  return true;
}

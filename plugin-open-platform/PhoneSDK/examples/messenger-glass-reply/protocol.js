export const REPLY_CHANNEL = 20051;

export const SUPPORTED_MESSENGERS = Object.freeze([
  Object.freeze({
    id: 'kakaotalk',
    label: '카카오톡',
    packages: Object.freeze(['com.kakao.talk']),
  }),
  Object.freeze({
    id: 'telegram',
    label: 'Telegram',
    packages: Object.freeze([
      'org.telegram.messenger',
      'org.telegram.messenger.web',
      'org.thunderdog.challegram',
    ]),
  }),
  Object.freeze({
    id: 'line', label: 'LINE', packages: Object.freeze(['jp.naver.line.android']),
  }),
  Object.freeze({
    id: 'muse-ai',
    label: '뮤즈AI',
    packages: Object.freeze(['com.museai.asst.mobile']),
  }),
]);

const encoder = new TextEncoder();

function clean(value, fallback = '') {
  const result = String(value ?? '').replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim();
  return result || fallback;
}

export function detectMessenger(packageName, appName, customMusePackages = []) {
  const pkg = clean(packageName).toLowerCase();
  const app = clean(appName).toLowerCase();
  for (const messenger of SUPPORTED_MESSENGERS) {
    if (messenger.packages.includes(pkg)) return messenger;
  }
  const custom = Array.isArray(customMusePackages)
    ? customMusePackages.map((value) => clean(value).toLowerCase()).filter(Boolean)
    : [];
  if (custom.includes(pkg) || /(?:뮤즈\s*ai|muse\s*ai)/iu.test(app)) return SUPPORTED_MESSENGERS.find(item => item.id === 'muse-ai');
  return null;
}

export function normalizeNotification(input, customMusePackages = []) {
  if (!input || typeof input !== 'object') throw new TypeError('알림 정보가 없습니다.');
  const messenger = detectMessenger(input.packageName, input.app, customMusePackages);
  if (!messenger) throw new Error('지원하지 않는 메신저 알림입니다.');
  const key = clean(input.key);
  const sender = clean(input.sender, '알 수 없는 발신자');
  const message = clean(input.message);
  if (!key) throw new Error('알림 키가 없습니다.');
  if (!message) throw new Error('메시지 내용이 없습니다.');
  return {
    key,
    messengerId: messenger.id,
    packageName: clean(input.packageName),
    app: clean(input.app, messenger.label),
    sender,
    message,
    canReply: input.canReply === true,
    postedAt: Number.isFinite(input.postedAt) ? input.postedAt : Date.now(),
  };
}

export function truncateUtf8(value, maxBytes) {
  const bytes = encoder.encode(String(value));
  if (bytes.length <= maxBytes) return String(value);
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, end)).replace(/�$/u, '');
}

export function formatGlassesNotification(notification) {
  const state = notification.canReply ? '한번 눌러 답장' : '답장 불가 (RemoteInput 없음)';
  const app = truncateUtf8(notification.app, 96);
  const sender = truncateUtf8(notification.sender, 192);
  const prefix = `${app}\n${sender}\n`;
  const suffix = `\n\n${state}`;
  const available = Math.max(0, 900 - encoder.encode(prefix).length - encoder.encode(suffix).length);
  return `${prefix}${truncateUtf8(notification.message, available)}${suffix}`;
}

export function buildReplyRequest(notification, text) {
  const reply = clean(text);
  if (!notification?.key) throw new Error('답장할 알림 키가 없습니다.');
  if (!reply) throw new Error('답장 내용이 없습니다.');
  if (reply.length > 500) throw new Error('답장은 500자 이하로 작성하세요.');
  return {
    type: 'notification.reply',
    key: notification.key,
    messengerId: notification.messengerId,
    text: reply,
  };
}

export function glassNotificationId(key) {
  const value = clean(key);
  const bytes = encoder.encode(value);
  if (bytes.length <= 64) return value;
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return `${truncateUtf8(value, 55)}-${hash.toString(16).padStart(8, '0')}`;
}

export function encodeGlassMessage(notification, text) {
  const id = encoder.encode(glassNotificationId(notification?.key));
  if (!id.length || id.length > 64) throw new Error('글라스 작업 ID가 잘못되었습니다.');
  const payload = encoder.encode(truncateUtf8(text, 959));
  const result = new Uint8Array(65 + payload.length);
  result[0] = 2;
  result.set(id, 1);
  result.set(payload, 65);
  return result;
}

export function decodeGlassesCommand(data, expectedNotificationKey) {
  if (!(data instanceof Uint8Array) || data.length !== 66 || data[0] !== 2) return null;
  const command = ({ 1: 'select', 2: 'voice', 3: 'send', 4: 'cancel', 5: 'previous', 6: 'next' })[data[1]];
  if (!command) return null;
  const notificationId = new TextDecoder().decode(data.slice(2)).replace(/\0+$/u, '');
  if (!notificationId || notificationId !== glassNotificationId(expectedNotificationKey)) return null;
  return { command, notificationId };
}

export const R08_CHANNEL = 0x4D52;
export const R08_REPLY_CHANNEL = 0x4D53;

let sequence = 0;

export function encodeR08Command(command, detail = {}) {
  if (!['next', 'previous', 'select', 'back'].includes(command)) {
    throw new Error(`Unsupported R08 command: ${command}`);
  }
  return new TextEncoder().encode(JSON.stringify({
    v: 1,
    id: ++sequence,
    source: 'r08',
    command,
    ...detail,
  }));
}

export function decodeR08Command(value) {
  const data = typeof value === 'string' ? value : new TextDecoder().decode(value);
  const message = JSON.parse(data);
  if (message?.v !== 1 || typeof message.command !== 'string') {
    throw new Error('Invalid R08 command');
  }
  return message;
}

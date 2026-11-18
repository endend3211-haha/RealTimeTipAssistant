import { createGMPlugin } from './vendor/gm-plugin-web-sdk.esm.js';
import { R08_CHANNEL, R08_REPLY_CHANNEL, encodeR08Command } from './r08-command.js';

const gm = createGMPlugin();
const status = document.querySelector('#status');

async function send(command, detail = {}) {
  const result = await gm.plugin.sendMessage(R08_CHANNEL, encodeR08Command(command, detail));
  status.textContent = `${command} sent (${result.payloadBytes ?? 0} bytes)`;
}

for (const button of document.querySelectorAll('[data-command]')) {
  button.addEventListener('click', () => void send(button.dataset.command));
}

window.addEventListener('r08-command', (event) => {
  const command = event.detail?.command;
  if (command) void send(command, { gesture: event.detail.gesture });
});

await gm.ready();
gm.plugin.onMessage(({ channel, data }) => {
  if (channel === R08_REPLY_CHANNEL) status.textContent = `Glasses: ${new TextDecoder().decode(data)}`;
});
status.textContent = 'Ready — pair the matching MemoMind glasses plugin.';

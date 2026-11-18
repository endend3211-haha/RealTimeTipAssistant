// Bounded, memory-only inbox. A draft pins its exact notification snapshot.
export class MessengerInbox {
  constructor(limit = 30) { this.limit = limit; this.items = new Map(); this.key = null; this.pinned = false; }
  upsert(notification) {
    if (this.pinned && notification.key === this.key) return false;
    this.items.set(notification.key, notification);
    if (!this.key) this.key = notification.key;
    while (this.items.size > this.limit) {
      const victim = [...this.items.keys()].find(key => key !== this.key);
      this.items.delete(victim);
    }
    return true;
  }
  get current() { return this.items.get(this.key) ?? null; }
  move(delta) {
    if (this.pinned || !this.items.size) return this.current;
    const keys = [...this.items.keys()];
    this.key = keys[(keys.indexOf(this.key) + delta + keys.length) % keys.length];
    return this.current;
  }
  remove(key) {
    this.items.delete(key);
    if (key === this.key) { this.pinned = false; this.key = this.items.keys().next().value ?? null; }
  }
}

export function textPages(text, size = 90) {
  const characters = Array.from(String(text));
  const pages = [];
  for (let i = 0; i < characters.length; i += size) pages.push(characters.slice(i, i + size).join(''));
  return pages.length ? pages : [''];
}

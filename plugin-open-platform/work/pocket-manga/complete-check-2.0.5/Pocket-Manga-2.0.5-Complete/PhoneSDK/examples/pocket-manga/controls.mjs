export function buttonCommand(action, screen, hasItems = true) {
  if (screen === 'reading') {
    if (action === 'single') return 'nextUnread';
    if (action === 'double') return 'previous';
    if (action === 'long' || action === 'very_long') return 'catalog';
  } else if (screen === 'catalog') {
    if (action === 'single' && hasItems) return 'nextItem';
    if (action === 'double' && hasItems) return 'previousItem';
    if (action === 'long' || action === 'very_long') return hasItems ? 'open' : 'demoCatalog';
  } else if (action === 'long' || action === 'very_long') return 'catalog';
  return null;
}

export function playerName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\p{Cc}\p{Cf}<>]/gu, '').replace(/\s+/gu, ' ').trim().slice(0, 16).trim();
}

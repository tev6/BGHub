export function excerpt(content, length = 120, emptyPlaceholder = '') {
  if (!content) return emptyPlaceholder;
  const plain = content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return plain.length <= length ? plain : `${plain.slice(0, length)}…`;
}
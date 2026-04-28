function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, '');
}

module.exports = stripHtml;
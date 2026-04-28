function extractFirstImageUrl(value) {
  const match = String(value || '').match(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)|<img[^>]+src=["']([^"']+)["']/i);
  return match ? (match[1] || match[2] || '') : '';
}

module.exports = extractFirstImageUrl;
const stripHtml = require('./stripHtml');

function excerpt(value, length = 120) {
  const plain = stripHtml(value).replace(/\s+/g, ' ').trim();
  return plain.length <= length ? plain : `${plain.slice(0, length)}…`;
}

module.exports = excerpt;
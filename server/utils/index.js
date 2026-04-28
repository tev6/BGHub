const slugify = require('./slugify');
const { buildCountdown, formatDate } = require('./date');
const renderMarkdown = require('./markdown');

module.exports = {
  slugify,
  buildCountdown,
  formatDate,
  renderMarkdown,
  stripHtml: require('./stripHtml'),
  excerpt: require('./excerpt'),
  extractFirstImageUrl: require('./extractFirstImageUrl')
};
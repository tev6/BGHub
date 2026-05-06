const slugify = require('./slugify');
const { buildCountdown, formatDate } = require('./date');
const renderMarkdown = require('./markdown');
const { validateEmail, parseDateValue } = require('./validation');
const { getUserLevel, isStaff, canManagePost, canMarkBestAnswer } = require('./permissions');
const { setFlash, wantsJson, respondError } = require('./request');
const logger = require('./logger');

module.exports = {
  slugify,
  buildCountdown,
  formatDate,
  renderMarkdown,
  stripHtml: require('./stripHtml'),
  excerpt: require('./excerpt'),
  extractFirstImageUrl: require('./extractFirstImageUrl'),
  validateEmail,
  parseDateValue,
  getUserLevel,
  isStaff,
  canManagePost,
  canMarkBestAnswer,
  setFlash,
  wantsJson,
  respondError,
  logger
};
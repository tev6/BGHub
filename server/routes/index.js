const createAuthRoutes = require('./auth');
const createForumRoutes = require('./forum');
const createBoardsRoutes = require('./boards');
const createCJRoutes = require('./cj');
const createHomeworksRoutes = require('./homeworks');
const createResourcesRoutes = require('./resources');
const createChatRoutes = require('./chat');
const createSearchRoutes = require('./search');
const createAdminRoutes = require('./admin');
const createAboutRoutes = require('./about');

function registerRoutes(app, {
  query,
  getBoards,
  getBoardById,
  getBoardDetail,
  getBoardBySlug,
  creditService,
  reviewService,
  reportService,
  notificationService,
  renderMarkdown,
  formatDate,
  buildCountdown,
  excerpt,
  ensureColumn,
  requireAuth,
  requireStaff,
  requireLevel,
  isStaff,
  upload,
  setFlash,
  sendVerificationEmail,
  respondError,
  wantsJson,
  sectionTitles,
  sectionTitlesEn,
  needsAIAudit,
  auditContent,
  applyContentCredit,
  helpers,
  getUserLevel
}) {
  app.use('/', createAuthRoutes({ query, creditService, setFlash, sendVerificationEmail }));

  app.use('/forum', createForumRoutes({
    query,
    requireAuth,
    requireStaff,
    renderMarkdown,
    creditService,
    getBoards,
    formatDate,
    isStaff,
    ensureColumn,
    setFlash,
    canManagePost: helpers.canManagePost,
    canMarkBestAnswer: helpers.canMarkBestAnswer,
    wantsJson,
    respondError,
    getUserLevel,
    needsAIAudit,
    auditContent,
    applyContentCredit,
    createReviewItem: helpers.createReviewItem,
    getPostDetail: helpers.getPostDetail,
    runTransaction: helpers.runTransaction
  }));

  app.use('/boards', createBoardsRoutes({
    query,
    requireAuth,
    requireLevel,
    getBoards,
    getBoardBySlug,
    getBoardDetail,
    sectionTitles,
    sectionTitlesEn,
    respondError,
    setFlash,
    isStaff,
    needsAIAudit,
    applyContentCredit,
    auditContent,
    wantsJson,
    getUserLevel
  }));

  app.use('/cj', createCJRoutes({
    query,
    requireAuth,
    requireLevel,
    getBoards,
    getBoardBySlug,
    sectionTitles,
    sectionTitlesEn,
    respondError,
    setFlash,
    isStaff,
    needsAIAudit,
    applyContentCredit,
    auditContent,
    wantsJson,
    getUserLevel
  }));

  app.use('/homeworks', createHomeworksRoutes({
    query,
    requireAuth,
    requireLevel,
    setFlash,
    wantsJson,
    getUserLevel,
    needsAIAudit,
    auditContent,
    applyContentCredit,
    createReviewItem: helpers.createReviewItem
  }));

  app.use('/resources', createResourcesRoutes({
    query,
    requireAuth,
    requireLevel,
    upload,
    formatDate,
    buildCountdown,
    ensureColumn,
    getBoards,
    getBoardById,
    isStaff,
    wantsJson,
    setFlash,
    respondError,
    getUserLevel
  }));

  app.use('/', createChatRoutes({
    query,
    requireAuth,
    setFlash,
    wantsJson,
    respondError,
    getUserLevel,
    auditContent,
    changeCredit: creditService.changeCredit,
    createReviewItem: helpers.createReviewItem,
    incrementDailyCount: helpers.incrementDailyCount
  }));

  app.use('/', createSearchRoutes({ query, requireAuth, wantsJson, respondError, setFlash }));

  app.use('/', createAdminRoutes({
    query,
    requireAuth,
    requireLevel,
    creditService,
    reviewService,
    reportService,
    notificationService,
    ensureColumn,
    setFlash,
    respondError,
    getUserLevel,
    runTransaction: helpers.runTransaction,
    parseDateValue: helpers.parseDateValue
  }));

  app.use('/about', createAboutRoutes({
    query,
    requireAuth,
    requireLevel,
    renderMarkdown,
    respondError,
    wantsJson,
    setFlash
  }));
}

module.exports = { registerRoutes };

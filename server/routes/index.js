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
const createSettingsRoutes = require('./settings');
const createUploadsRoutes = require('./uploads');
const createNotificationsRoutes = require('./notifications');
const createApiRoutes = require('./api');
const createDashboardRoutes = require('./dashboard');
const { createHomeRoutes } = require('./home');
const { createReviewRoutes } = require('./review');
const { createHomeController, createReviewController } = require('../controllers');

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
  dashboardService,
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
  getUserLevel,
  bcrypt,
  uploadDir,
  path
}) {
  const homeController = createHomeController({ dashboardService, formatDate });
  const reviewController = createReviewController({ query, getUserLevel });

  app.use('/', createHomeRoutes({ homeController, requireAuth }));
  app.use('/', createReviewRoutes({ reviewController, requireAuth, requireLevel }));
  app.use('/', createDashboardRoutes({ query, requireAuth, requireLevel, getUserLevel }));

  app.use('/', createAuthRoutes({ query, creditService, setFlash, sendVerificationEmail }));

  const { router: forumRouter, postService } = createForumRoutes({
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
  });
  app.use('/forum', forumRouter);

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
    getUserLevel,
    createReviewItem: helpers.createReviewItem
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

  const { pageRouter: settingsPageRouter, apiRouter: settingsApiRouter } = createSettingsRoutes({
    query,
    requireAuth,
    bcrypt
  });
  app.use('/', settingsPageRouter);
  app.use('/api', settingsApiRouter);

  app.use('/', createUploadsRoutes({ uploadDir, path }));

  const { pageRouter: notificationsPageRouter, apiRouter: notificationsApiRouter } = createNotificationsRoutes({
    query,
    requireAuth
  });
  app.use('/', notificationsPageRouter);
  app.use('/api', notificationsApiRouter);

  const apiRouter = createApiRoutes({
    query,
    requireAuth,
    requireStaff,
    requireLevel,
    creditService,
    upload,
    getBoards,
    getBoardById,
    isStaff,
    validateEmail: helpers.validateEmail,
    getDashboardData: helpers.getDashboardData,
    getForumPosts: helpers.getForumPosts,
    getPostDetail: helpers.getPostDetail,
    createOrUpdatePost: postService.createOrUpdatePost,
    searchAll: helpers.searchAll,
    auditContent,
    needsAIAudit,
    applyContentCredit,
    createReviewItem: helpers.createReviewItem,
    canManagePost: helpers.canManagePost,
    formatDate,
    respondError,
    wantsJson
  });
  app.use('/api', apiRouter);
}

module.exports = { registerRoutes };

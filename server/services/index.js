const { createCreditService } = require('./credit');
const { createNotificationService } = require('./notification');
const { moderateChatMessage, moderatePost, moderateResource, moderateContent } = require('./moderation');
const { createReviewService, REVIEW_STAGES, ITEM_TYPES } = require('./reviewService');
const { createReportService, TARGET_TYPES, REPORT_STATUS } = require('./reportService');
const { createDashboardService } = require('./dashboard');
const { createWebSocketService } = require('./websocket');
const { createEmailService } = require('./email');

function createServices({ query, getUserLevel, resend }) {
  const creditService = createCreditService({ query, getUserLevel });
  const notificationService = createNotificationService({ query });
  const moderation = { moderateChatMessage, moderatePost, moderateResource, moderateContent };
  
  const reviewService = createReviewService({ 
    query, 
    creditService, 
    notificationService, 
    moderation, 
    getUserLevel 
  });
  
  const reportService = createReportService({ 
    query, 
    creditService, 
    notificationService, 
    getUserLevel 
  });

  const dashboardService = createDashboardService({ query });
  const webSocketService = createWebSocketService();
  const emailService = createEmailService({ query, resend });

  return {
    creditService,
    notificationService,
    reviewService,
    reportService,
    dashboardService,
    webSocketService,
    emailService,
    moderateChatMessage,
    moderatePost,
    moderateResource,
    moderateContent
  };
}

module.exports = {
  createServices,
  moderateChatMessage,
  moderatePost,
  moderateResource,
  moderateContent,
  REVIEW_STAGES,
  ITEM_TYPES,
  TARGET_TYPES,
  REPORT_STATUS,
  createDashboardService,
  createWebSocketService,
  createEmailService
};
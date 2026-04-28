const { createCreditService } = require('./credit');
const { createNotificationService } = require('./notification');
const { moderateChatMessage, moderatePost, moderateResource, moderateContent } = require('./moderation');
const { createReviewService, REVIEW_STAGES, ITEM_TYPES } = require('./reviewService');
const { createReportService, TARGET_TYPES, REPORT_STATUS } = require('./reportService');

function createServices({ query, getUserLevel }) {
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

  return {
    creditService,
    notificationService,
    reviewService,
    reportService,
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
  REPORT_STATUS
};
const { createCreditService } = require('./credit');
const { createNotificationService } = require('./notification');
const { moderateChatMessage, moderatePost, moderateResource, moderateContent } = require('./moderation');

function createServices({ query, getUserLevel }) {
  const creditService = createCreditService({ query, getUserLevel });
  const notificationService = createNotificationService({ query });

  return {
    creditService,
    notificationService,
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
  moderateContent
};
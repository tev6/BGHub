const express = require('express');

function createReviewRoutes({ reviewController, requireAuth, requireLevel }) {
  const router = express.Router();

  router.get('/review', requireAuth, requireLevel(3), async (req, res, next) => {
    try {
      await reviewController.index(req, res);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  createReviewRoutes
};

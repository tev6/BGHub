const express = require('express');

function createHomeRoutes({ homeController, requireAuth }) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      await homeController.index(req, res);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  createHomeRoutes
};

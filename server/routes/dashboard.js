const express = require('express');

function createDashboardRoutes({ query, requireAuth, requireLevel, getUserLevel }) {
  const router = express.Router();

  router.get('/dashboard', requireAuth, requireLevel(3), async (req, res) => {
    const userLevel = getUserLevel(req.user);
    const userId = req.user.id;

    const pendingCount = await query.get(
      "SELECT COUNT(*) AS count FROM review_items WHERE status = 'pending'"
    );

    const myReviewsToday = await query.get(
      "SELECT COUNT(*) AS count FROM review_actions WHERE reviewer_id = ? AND DATE(created_at) = DATE('now')",
      [userId]
    );

    const myPendingPosts = await query.get(
      "SELECT COUNT(*) AS count FROM posts WHERE user_id = ? AND review_status = 'pending'",
      [userId]
    );

    const reviewStats = await query.get(
      "SELECT COUNT(*) AS count FROM review_actions WHERE reviewer_id = ?",
      [userId]
    );

    let targetMin = 0;
    let targetMax = 0;
    if (userLevel <= 5 && userLevel >= 3) {
      const roleInfo = await query.get('SELECT review_target_min, review_target_max FROM roles WHERE level = ?', [userLevel]);
      if (roleInfo) {
        targetMin = roleInfo.review_target_min;
        targetMax = roleInfo.review_target_max;
      }
    }

    res.render('dashboard', {
      pageTitle: '我的面板',
      currentPath: '/dashboard',
      userLevel,
      pendingCount: pendingCount.count,
      myReviewsToday: myReviewsToday.count,
      myPendingPosts: myPendingPosts.count,
      reviewStats: reviewStats.count,
      targetMin,
      targetMax
    });
  });

  return router;
}

module.exports = createDashboardRoutes;

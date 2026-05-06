function createHomeController({ dashboardService, formatDate }) {
  return {
    async index(req, res) {
      const dateStr = req.query.date || null;
      const showAllClasses = req.query.showAllClasses === 'true';
      const dashboard = await dashboardService.getDashboardData(req.user, dateStr, req.gradeContext, showAllClasses);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

      if (dateStr && dateStr < sevenDaysAgoStr) {
        return res.redirect(`/?date=${sevenDaysAgoStr}`);
      }

      let selectedDateObj = null;
      if (dateStr) {
        selectedDateObj = new Date(dateStr);
        selectedDateObj.setHours(0, 0, 0, 0);
      } else {
        selectedDateObj = new Date(today);
      }

      const diffDays = Math.round((today - selectedDateObj) / (1000 * 60 * 60 * 24));

      function formatDisplayDate(dateObj, diffDays, locale) {
        const m = dateObj.getMonth() + 1;
        const d = dateObj.getDate();
        const y = dateObj.getFullYear();
        const formatted = `${m}/${d}/${y}`;
        if (diffDays === 0) return locale === 'en' ? `Today ${formatted}` : `今天 ${formatted}`;
        if (diffDays === 1) return locale === 'en' ? `Yesterday ${formatted}` : `昨天 ${formatted}`;
        if (diffDays === 2) return locale === 'en' ? formatted : `前天 ${formatted}`;
        return formatted;
      }

      let display = formatDisplayDate(selectedDateObj, diffDays, res.locals.locale);

      const prevDateObj = new Date(selectedDateObj);
      prevDateObj.setDate(prevDateObj.getDate() - 1);
      const prevDate = prevDateObj.toISOString().split('T')[0];

      const nextDateObj = new Date(selectedDateObj);
      nextDateObj.setDate(nextDateObj.getDate() + 1);
      const nextDate = nextDateObj.toISOString().split('T')[0];

      const isToday = !dateStr;
      const isFuture = selectedDateObj.getTime() > today.getTime();

      res.render('home', {
        pageTitle: '主页',
        homeStats: dashboard.stats,
        dateNavData: {
          display,
          prevDate,
          nextDate,
          isToday,
          isFuture
        },
        ...dashboard
      });
    }
  };
}

function createReviewController({ query, getUserLevel }) {
  return {
    async index(req, res) {
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = 20;
      const offset = (page - 1) * limit;
      const userLevel = getUserLevel(req.user);

      let statusFilter = "status = 'pending'";
      if (userLevel === 3) {
        statusFilter = "status = 'pending' AND item_type = 'chat'";
      }

      const items = await query.all(`
        SELECT review_items.*,
               users.name AS author_name,
               reviewer.name AS reviewer_name
        FROM review_items
        JOIN users ON users.id = review_items.created_by
        LEFT JOIN users AS reviewer ON reviewer.id = review_items.reviewer_id
        WHERE ${statusFilter}
        ORDER BY datetime(review_items.created_at) DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      const countRow = await query.get(`
        SELECT COUNT(*) AS total FROM review_items WHERE ${statusFilter}
      `);

      const appealsPage = Math.max(1, Number(req.query.appeals_page || 1));
      const appealsLimit = 20;
      const appealsOffset = (appealsPage - 1) * appealsLimit;

      let appealsFilter = "status = 'pending'";
      if (userLevel === 3) {
        appealsFilter = "status = 'pending' AND content_type = 'chat'";
      } else if (userLevel === 4) {
        appealsFilter = "status = 'pending' AND content_type IN ('chat', 'post')";
      }

      const appeals = await query.all(`
        SELECT review_appeals.*,
               users.name AS author_name
        FROM review_appeals
        JOIN users ON users.id = review_appeals.user_id
        WHERE ${appealsFilter}
        ORDER BY datetime(review_appeals.created_at) DESC
        LIMIT ? OFFSET ?
      `, [appealsLimit, appealsOffset]);

      const appealsCount = await query.get(`
        SELECT COUNT(*) AS total FROM review_appeals WHERE ${appealsFilter}
      `);

      res.render('review', {
        pageTitle: '审核面板',
        items,
        appeals,
        pagination: {
          page,
          totalPages: Math.ceil(countRow.total / limit),
          totalItems: countRow.total
        },
        appealsPagination: {
          page: appealsPage,
          totalPages: Math.ceil(appealsCount.total / appealsLimit),
          totalItems: appealsCount.total
        }
      });
    }
  };
}

module.exports = {
  createHomeController,
  createReviewController
};

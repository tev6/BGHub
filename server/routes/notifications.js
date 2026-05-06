const express = require('express');

function createNotificationsRoutes({ query, requireAuth }) {
  const pageRouter = express.Router();
  const apiRouter = express.Router();

  pageRouter.get('/notifications', requireAuth, async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 20;
    const offset = (page - 1) * limit;
    const type = req.query.type || 'all';

    await query.run(
      'UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );

    let typeFilter = '';
    if (type === 'unread') {
      typeFilter = "AND is_read = 0";
    } else if (type === 'review') {
      typeFilter = "AND notification_type = 'review'";
    } else if (type === 'system') {
      typeFilter = "AND notification_type = 'system'";
    } else if (type === 'interaction') {
      typeFilter = "AND notification_type = 'interaction'";
    }

    const notifications = await query.all(`
      SELECT * FROM notifications
      WHERE user_id = ? ${typeFilter}
      ORDER BY datetime(created_at) DESC
      LIMIT ? OFFSET ?
    `, [req.user.id, limit, offset]);

    const countRow = await query.get(`
      SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? ${typeFilter}
    `, [req.user.id]);

    res.render('notifications', {
      pageTitle: '通知中心',
      notifications,
      currentType: type,
      pagination: {
        page,
        totalPages: Math.ceil(countRow.total / limit),
        totalItems: countRow.total
      }
    });
  });

  apiRouter.get('/notifications', requireAuth, async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 20;
    const offset = (page - 1) * limit;
    const type = req.query.type || 'all';

    let typeFilter = '';
    if (type === 'unread') {
      typeFilter = "AND is_read = 0";
    } else if (type === 'review') {
      typeFilter = "AND notification_type = 'review'";
    } else if (type === 'system') {
      typeFilter = "AND notification_type = 'system'";
    } else if (type === 'interaction') {
      typeFilter = "AND notification_type = 'interaction'";
    }

    const notifications = await query.all(`
      SELECT * FROM notifications
      WHERE user_id = ? ${typeFilter}
      ORDER BY datetime(created_at) DESC
      LIMIT ? OFFSET ?
    `, [req.user.id, limit, offset]);

    res.json({ notifications });
  });

  apiRouter.get('/notifications/unread-count', requireAuth, async (req, res) => {
    const row = await query.get(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ count: row.count });
  });

  apiRouter.post('/notifications/:id/read', requireAuth, async (req, res) => {
    const notification = await query.get(
      'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!notification) {
      res.status(404).json({ error: '通知不存在' });
      return;
    }

    await query.run(
      'UPDATE notifications SET is_read = 1 WHERE id = ?',
      [req.params.id]
    );

    res.json({ ok: true });
  });

  apiRouter.post('/notifications/read-all', requireAuth, async (req, res) => {
    await query.run(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ ok: true });
  });

  return { pageRouter, apiRouter };
}

module.exports = createNotificationsRoutes;

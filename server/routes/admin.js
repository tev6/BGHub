const express = require('express');
const bcrypt = require('bcryptjs');

function createAdminRoutes({ query, requireAuth, requireLevel, creditService, reviewService, reportService, notificationService, ensureColumn, setFlash }) {
  const router = express.Router();

  function getUserLevel(user) {
    return Math.max(0, Number(user && user.role_level != null ? user.role_level : 0));
  }

  function getStageLabel(stage) {
    const labels = {
      'pending_ai': '等待AI审核',
      'ai_reviewing': 'AI审核中',
      'ai_rejected': 'AI审核未通过',
      'pending_human': '等待人工审核',
      'approved': '已通过',
      'rejected': '已驳回'
    };
    return labels[stage] || stage;
  }

  function wantsJson(req) {
    return req.path.startsWith('/api/');
  }

  router.get('/api/admin/logs', requireAuth, requireLevel(5), async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 50;
    const offset = (page - 1) * limit;

    const logs = await query.all(`
      SELECT al.*, u.name AS admin_name, tu.name AS target_name
      FROM admin_log al
      JOIN users u ON u.id = al.admin_user_id
      LEFT JOIN users tu ON tu.id = al.target_user_id
      ORDER BY datetime(al.created_at) DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    res.json({ logs });
  });

  router.post('/api/admin/credit', requireAuth, requireLevel(6), async (req, res) => {
    const targetUserId = Number(req.body.user_id || 0);
    const delta = Number(req.body.delta || 0);
    const password = String(req.body.password || '');
    const ip = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';

    if (!password) {
      res.status(400).json({ error: '请提供操作密码' });
      return;
    }

    const admin = await query.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      res.status(403).json({ error: '密码验证失败' });
      return;
    }

    const target = await query.get('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (!target) {
      res.status(404).json({ error: '目标用户不存在' });
      return;
    }

    const result = await creditService.changeCredit(targetUserId, delta, '管理员操作', req.user.id);

    await query.run(
      'INSERT INTO admin_log (admin_user_id, action, target_user_id, ip) VALUES (?, ?, ?, ?)',
      [req.user.id, `credit_change:${delta}`, targetUserId, ip]
    );

    res.json({ ok: true, new_credit: result.credit });
  });

  router.post('/api/admin/ban', requireAuth, requireLevel(6), async (req, res) => {
    const targetUserId = Number(req.body.user_id || 0);
    const days = Number(req.body.days || 0);
    const reason = String(req.body.reason || '');
    const password = String(req.body.password || '');
    const ip = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';

    if (!password) {
      res.status(400).json({ error: '请提供操作密码' });
      return;
    }

    const admin = await query.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      res.status(403).json({ error: '密码验证失败' });
      return;
    }

    const bannedUntil = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;
    await query.run('UPDATE users SET banned_until = ? WHERE id = ?', [bannedUntil, targetUserId]);

    await query.run(
      'INSERT INTO admin_log (admin_user_id, action, target_user_id, ip) VALUES (?, ?, ?, ?)',
      [req.user.id, `ban:${days}days:${reason}`, targetUserId, ip]
    );

    res.json({ ok: true, banned_until: bannedUntil });
  });

  router.get('/admin/users', requireAuth, requireLevel(6), async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 20;
    const offset = (page - 1) * limit;
    const search = String(req.query.q || '').trim();

    let where = '';
    let params = [];
    if (search) {
      where = 'WHERE u.name LIKE ? OR u.email LIKE ?';
      params = [`%${search}%`, `%${search}%`];
    }

    const total = await query.get(`SELECT COUNT(*) AS count FROM users u ${where}`, params);
    const users = await query.all(`
      SELECT u.id, u.name, u.email, u.grade, u.role_level, u.banned_until, u.created_at,
             r.name AS role_name, r.badge_color,
             COALESCE(uc.credit, 0) AS credit
      FROM users u
      LEFT JOIN roles r ON r.level = u.role_level
      LEFT JOIN user_credit uc ON uc.user_id = u.id
      ${where}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    res.render('admin/users', {
      pageTitle: '用户管理',
      currentPath: '/admin/users',
      users,
      total: total.count,
      page,
      pages: Math.ceil(total.count / limit),
      search
    });
  });

  router.get('/api/admin/users', requireAuth, requireLevel(6), async (req, res) => {
    const search = String(req.query.q || '').trim();
    let where = '';
    let params = [];
    if (search) {
      where = 'WHERE u.name LIKE ? OR u.email LIKE ?';
      params = [`%${search}%`, `%${search}%`];
    }

    const users = await query.all(`
      SELECT u.id, u.name, u.email, u.grade, u.role_level, u.banned_until, u.created_at,
             r.name AS role_name,
             COALESCE(uc.credit, 0) AS credit
      FROM users u
      LEFT JOIN roles r ON r.level = u.role_level
      LEFT JOIN user_credit uc ON uc.user_id = u.id
      ${where}
      ORDER BY u.created_at DESC
      LIMIT 50
    `, params);

    res.json({ users });
  });

  router.post('/api/admin/users/:id/role', requireAuth, requireLevel(6), async (req, res) => {
    const targetId = Number(req.params.id);
    const newLevel = Number(req.body.level);
    const ip = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';

    if (![1, 2, 3, 4, 5, 55, 6].includes(newLevel)) {
      res.status(400).json({ error: '无效的等级值' });
      return;
    }

    if (targetId === req.user.id) {
      res.status(400).json({ error: '不能修改自己的等级' });
      return;
    }

    const newRole = await query.get('SELECT min_credit FROM roles WHERE level = ?', [newLevel]);
    const newCredit = newRole ? newRole.min_credit : 0;
    if (newCredit < 0) {
      const maxCreditRole = await query.get('SELECT min_credit FROM roles WHERE level = 5');
      await query.run(
        'UPDATE user_credit SET credit = ? WHERE user_id = ?',
        [maxCreditRole ? maxCreditRole.min_credit : 0, targetId]
      );
    } else {
      await query.run(
        'UPDATE user_credit SET credit = ? WHERE user_id = ?',
        [newCredit, targetId]
      );
    }

    await query.run('UPDATE users SET role_level = ? WHERE id = ?', [newLevel, targetId]);
    await query.run(
      'INSERT INTO admin_log (admin_user_id, action, target_user_id, ip) VALUES (?, ?, ?, ?)',
      [req.user.id, `set_role:${newLevel}`, targetId, ip]
    );

    res.json({ ok: true });
  });

  router.post('/api/admin/users/:id/grant-lv55', requireAuth, requireLevel(6), async (req, res) => {
    const targetId = Number(req.params.id);
    const ip = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';

    await query.run('UPDATE users SET role_level = 55 WHERE id = ?', [targetId]);
    await query.run(
      'INSERT INTO admin_log (admin_user_id, action, target_user_id, ip) VALUES (?, ?, ?, ?)',
      [req.user.id, 'grant_lv55', targetId, ip]
    );

    res.json({ ok: true });
  });

  router.post('/api/admin/users/:id/revoke-lv55', requireAuth, requireLevel(6), async (req, res) => {
    const targetId = Number(req.params.id);
    const ip = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';

    await query.run('UPDATE users SET role_level = 5 WHERE id = ?', [targetId]);
    const lv5Role = await query.get('SELECT min_credit FROM roles WHERE level = 5');
    await query.run(
      'UPDATE user_credit SET credit = ? WHERE user_id = ?',
      [lv5Role ? lv5Role.min_credit : 0, targetId]
    );
    await query.run(
      'INSERT INTO admin_log (admin_user_id, action, target_user_id, ip) VALUES (?, ?, ?, ?)',
      [req.user.id, 'revoke_lv55', targetId, ip]
    );

    res.json({ ok: true });
  });

  router.delete('/api/admin/users/:id', requireAuth, requireLevel(6), async (req, res) => {
    const targetId = Number(req.params.id);
    const ip = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';

    if (targetId === req.user.id) {
      res.status(400).json({ error: '不能删除自己' });
      return;
    }

    await query.run('DELETE FROM users WHERE id = ?', [targetId]);
    await query.run(
      'INSERT INTO admin_log (admin_user_id, action, target_user_id, ip) VALUES (?, ?, ?, ?)',
      [req.user.id, 'delete_user', targetId, ip]
    );

    res.json({ ok: true });
  });

  router.get('/api/review/items', requireAuth, requireLevel(3), async (req, res) => {
    try {
      const userLevel = getUserLevel(req.user);
      const filters = {
        status: String(req.query.status || 'pending'),
        stage: String(req.query.stage || ''),
        itemType: String(req.query.type || ''),
        page: Math.max(1, Number(req.query.page || 1)),
        limit: 20
      };

      const result = await reviewService.getReviewQueue(userLevel, filters);
      
      res.json({
        items: result.items.map(item => ({
          ...item,
          stage_label: getStageLabel(item.review_stage)
        })),
        pagination: result.pagination
      });
    } catch (error) {
      console.error('[Review API] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/review/stats', requireAuth, requireLevel(3), async (req, res) => {
    try {
      const userLevel = getUserLevel(req.user);
      const stats = await reviewService.getReviewStats(userLevel);
      res.json(stats);
    } catch (error) {
      console.error('[Review Stats API] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/review/appeals/list', requireAuth, requireLevel(3), async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 20;
    const offset = (page - 1) * limit;
    const userLevel = getUserLevel(req.user);

    let typeFilter = '';
    if (userLevel === 3) {
      typeFilter = "AND ra.content_type = 'chat'";
    } else if (userLevel === 4) {
      typeFilter = "AND ra.content_type IN ('chat', 'post')";
    }

    const appeals = await query.all(`
      SELECT ra.*,
             u.name AS author_name,
             reviewer.name AS reviewer_name
      FROM review_appeals ra
      JOIN users u ON u.id = ra.user_id
      LEFT JOIN users reviewer ON reviewer.id = ra.reviewer_id
      WHERE ra.status = 'pending' ${typeFilter}
      ORDER BY datetime(ra.created_at) DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const countRow = await query.get(`
      SELECT COUNT(*) AS total FROM review_appeals ra WHERE ra.status = 'pending' ${typeFilter}
    `);

    res.json({
      appeals,
      pagination: {
        page,
        totalPages: Math.ceil(countRow.total / limit),
        totalItems: countRow.total
      }
    });
  });

  router.get('/api/review/ai-reviewing', requireAuth, requireLevel(3), async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 20;
    const offset = (page - 1) * limit;
    const typeFilter = String(req.query.type || '');
    const userLevel = getUserLevel(req.user);

    let typeCondition = '';
    let typeFilterForCount = '';
    let params = [];
    let countParams = [];
    if (typeFilter) {
      typeCondition = 'AND ri.item_type = ?';
      typeFilterForCount = 'AND ri.item_type = ?';
      params.push(typeFilter);
      countParams.push(typeFilter);
    }

    let itemTypeFilter = '';
    if (userLevel === 3) {
      itemTypeFilter = "AND ri.item_type = 'chat'";
    } else if (userLevel === 4) {
      itemTypeFilter = "AND ri.item_type IN ('chat', 'post')";
    }

    const items = await query.all(`
      SELECT ri.*,
             u.name AS author_name,
             u.role_level AS author_level,
             CASE ri.item_type
               WHEN 'post' THEN (SELECT title FROM posts WHERE id = ri.item_id)
               WHEN 'chat' THEN (SELECT content FROM chat_messages WHERE id = ri.item_id)
               WHEN 'resource' THEN (SELECT title FROM resources WHERE id = ri.item_id)
               WHEN 'homework' THEN (SELECT title FROM homeworks WHERE id = ri.item_id)
               ELSE ''
             END AS item_title
      FROM review_items ri
      JOIN users u ON u.id = ri.created_by
      WHERE ri.status = 'pending' 
        AND ri.review_stage IN ('pending_ai', 'ai_reviewing')
        ${itemTypeFilter}
        ${typeCondition}
      ORDER BY ri.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const countRow = await query.get(`
      SELECT COUNT(*) AS total FROM review_items ri
      WHERE ri.status = 'pending' 
        AND ri.review_stage IN ('pending_ai', 'ai_reviewing')
        ${itemTypeFilter}
        ${typeFilterForCount}
    `, countParams);

    res.json({
      items: items.map(item => ({
        ...item,
        item_title: item.item_title ? (item.item_title.substring(0, 50) + (item.item_title.length > 50 ? '...' : '')) : ''
      })),
      pagination: {
        page,
        limit,
        total: countRow.total,
        totalItems: countRow.total,
        totalPages: Math.ceil(countRow.total / limit)
      }
    });
  });

  router.get('/api/review/items/:id', requireAuth, requireLevel(3), async (req, res) => {
    const item = await query.get(`
      SELECT ri.*,
             u.name AS author_name,
             u.email AS author_email
      FROM review_items ri
      JOIN users u ON u.id = ri.created_by
      WHERE ri.id = ?
    `, [req.params.id]);

    if (!item) {
      res.status(404).json({ error: '审核项不存在' });
      return;
    }

    let content = null;
    if (item.item_type === 'post') {
      content = await query.get('SELECT * FROM posts WHERE id = ?', [item.item_id]);
    } else if (item.item_type === 'chat') {
      content = await query.get('SELECT * FROM chat_messages WHERE id = ?', [item.item_id]);
    } else if (item.item_type === 'resource') {
      content = await query.get('SELECT * FROM resources WHERE id = ?', [item.item_id]);
    }

    const history = await query.all(`
      SELECT ra.*, u.name AS reviewer_name
      FROM review_actions ra
      JOIN users u ON u.id = ra.reviewer_id
      WHERE ra.review_id = ?
      ORDER BY datetime(ra.created_at) DESC
    `, [req.params.id]);

    res.json({ item, content, history });
  });

  router.post('/api/review/items/:id/approve', requireAuth, requireLevel(3), async (req, res) => {
    try {
      const reason = String(req.body.reason || '').trim();
      if (reason.length < 10 || reason.length > 200) {
        res.status(400).json({ error: '审核理由需在 10-200 个字符之间' });
        return;
      }

      const result = await reviewService.processHumanReview(
        Number(req.params.id),
        req.user.id,
        'approve',
        reason
      );

      if (req.app.locals.sendToUser) {
        const item = await query.get('SELECT * FROM review_items WHERE id = ?', [req.params.id]);
        if (item) {
          req.app.locals.sendToUser(item.created_by, {
            type: 'notification',
            title: '内容审核通过',
            content: '您的' + (item.item_type === 'post' ? '帖子' : item.item_type === 'chat' ? '聊天消息' : '资源') + '已通过审核'
          });
        }
      }

      res.json({ ok: true, message: '审核通过' });
    } catch (error) {
      console.error('[Review Approve API] Error:', error.message);
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/api/review/items/:id/reject', requireAuth, requireLevel(3), async (req, res) => {
    try {
      const reason = String(req.body.reason || '').trim();
      if (reason.length < 10 || reason.length > 200) {
        res.status(400).json({ error: '审核理由需在 10-200 个字符之间' });
        return;
      }

      const result = await reviewService.processHumanReview(
        Number(req.params.id),
        req.user.id,
        'reject',
        reason
      );

      if (req.app.locals.sendToUser) {
        const item = await query.get('SELECT * FROM review_items WHERE id = ?', [req.params.id]);
        if (item) {
          req.app.locals.sendToUser(item.created_by, {
            type: 'notification',
            title: '内容审核未通过',
            content: '您的' + (item.item_type === 'post' ? '帖子' : item.item_type === 'chat' ? '聊天消息' : '资源') + '未通过审核'
          });
        }
      }

      res.json({ ok: true, message: '审核驳回' });
    } catch (error) {
      console.error('[Review Reject API] Error:', error.message);
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/api/review/appeals', requireAuth, requireLevel(3), async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 20;
    const offset = (page - 1) * limit;
    const userLevel = getUserLevel(req.user);

    let typeFilter = '';
    if (userLevel === 3) {
      typeFilter = "AND ri.item_type = 'chat'";
    } else if (userLevel === 4) {
      typeFilter = "AND ri.item_type IN ('chat', 'post')";
    }

    const items = await query.all(`
      SELECT ri.*,
             u.name AS author_name,
             r.name AS reviewer_name
      FROM review_items ri
      JOIN users u ON u.id = ri.created_by
      LEFT JOIN users r ON r.id = ri.reviewer_id
      WHERE ri.status = 'pending' ${typeFilter}
      ORDER BY datetime(ri.created_at) DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const appeals = await query.all(`
      SELECT ra.*,
             u.name AS appellant_name,
             reviewer.name AS reviewer_name
      FROM review_appeals ra
      JOIN users u ON u.id = ra.user_id
      LEFT JOIN users reviewer ON reviewer.id = ra.reviewer_id
      WHERE ra.status = 'pending'
      ORDER BY datetime(ra.created_at) DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const reviewCount = await query.get(`
      SELECT COUNT(*) AS total FROM review_items ri WHERE ri.status = 'pending' ${typeFilter}
    `);

    const appealCount = await query.get(
      'SELECT COUNT(*) AS total FROM review_appeals WHERE status = \'pending\''
    );

    res.json({
      items,
      appeals,
      counts: {
        reviewItems: reviewCount ? reviewCount.total : 0,
        appeals: appealCount ? appealCount.total : 0
      },
      pagination: {
        page,
        totalPages: Math.ceil((reviewCount ? reviewCount.total : 0) / limit),
        totalItems: reviewCount ? reviewCount.total : 0
      }
    });
  });

  router.get('/api/reports/list', requireAuth, requireLevel(4), async (req, res) => {
    try {
      const userLevel = getUserLevel(req.user);
      const filters = {
        status: String(req.query.status || 'pending'),
        page: Math.max(1, Number(req.query.page || 1)),
        limit: 20
      };

      const result = await reportService.getReportQueue(userLevel, filters);
      res.json(result);
    } catch (error) {
      console.error('[Reports List API] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/reports/stats', requireAuth, requireLevel(4), async (req, res) => {
    try {
      const userLevel = getUserLevel(req.user);
      const stats = await reportService.getReportStats(userLevel);
      res.json(stats);
    } catch (error) {
      console.error('[Reports Stats API] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/reports/:id', requireAuth, requireLevel(4), async (req, res) => {
    try {
      const report = await query.get(`
        SELECT r.*,
               reporter.name AS reporter_name,
               target.name AS target_name,
               target.role_level AS target_role_level,
               reviewer.name AS reviewer_name
        FROM reports r
        JOIN users reporter ON reporter.id = r.reporter_id
        LEFT JOIN users target ON target.id = r.target_user_id
        LEFT JOIN users reviewer ON reviewer.id = r.reviewer_id
        WHERE r.id = ?
      `, [req.params.id]);

      if (!report) {
        res.status(404).json({ error: '举报不存在' });
        return;
      }

      res.json({ report });
    } catch (error) {
      console.error('[Report Detail API] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/api/reports/:id/verify', requireAuth, requireLevel(4), async (req, res) => {
    try {
      const reason = String(req.body.reason || '').trim();
      if (reason.length < 5) {
        res.status(400).json({ error: '请提供处理理由' });
        return;
      }

      const result = await reportService.processReport(
        Number(req.params.id),
        req.user.id,
        'verify',
        reason
      );

      res.json({ ok: true, message: '举报已成立' });
    } catch (error) {
      console.error('[Report Verify API] Error:', error.message);
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/api/reports/:id/dismiss', requireAuth, requireLevel(4), async (req, res) => {
    try {
      const reason = String(req.body.reason || '').trim();
      if (reason.length < 5) {
        res.status(400).json({ error: '请提供处理理由' });
        return;
      }

      const result = await reportService.processReport(
        Number(req.params.id),
        req.user.id,
        'dismiss',
        reason
      );

      res.json({ ok: true, message: '举报已驳回' });
    } catch (error) {
      console.error('[Report Dismiss API] Error:', error.message);
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/api/review/:id/appeal-decide', requireAuth, requireLevel(3), async (req, res) => {
    const appealId = Number(req.params.id);
    const decision = String(req.body.decision || '').trim();
    const reviewNote = String(req.body.review_note || '').trim();

    if (!['approve', 'reject'].includes(decision)) {
      res.status(400).json({ error: '无效的裁决决定' });
      return;
    }

    if (reviewNote.length < 5 || reviewNote.length > 200) {
      res.status(400).json({ error: '审核备注需在 5-200 个字符之间' });
      return;
    }

    const appeal = await query.get('SELECT * FROM review_appeals WHERE id = ?', [appealId]);
    if (!appeal) {
      res.status(404).json({ error: '申诉项不存在' });
      return;
    }

    if (appeal.status !== 'pending') {
      res.status(400).json({ error: '该申诉已处理' });
      return;
    }

    if (decision === 'approve') {
      await query.run(
        "UPDATE review_appeals SET status = 'approved', reviewer_id = ?, review_note = ?, credit_restored = 1, credit_compensation = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [req.user.id, reviewNote, 3, appealId]
      );

      if (appeal.content_type === 'post') {
        await query.run("UPDATE posts SET review_status = 'approved' WHERE id = ?", [appeal.content_id]);
      } else if (appeal.content_type === 'comment') {
        await query.run("UPDATE comments SET status = 'approved' WHERE id = ?", [appeal.content_id]);
      } else if (appeal.content_type === 'chat') {
        await query.run("UPDATE chat_messages SET status = 'approved' WHERE id = ?", [appeal.content_id]);
      } else if (appeal.content_type === 'resource') {
        await query.run("UPDATE resources SET status = 'approved' WHERE id = ?", [appeal.content_id]);
      }

      await creditService.changeCredit(appeal.user_id, 1, '申诉成功-恢复信用', req.user.id);
      await creditService.changeCredit(appeal.user_id, 3, '申诉补偿', req.user.id);
    } else {
      await query.run(
        "UPDATE review_appeals SET status = 'rejected', reviewer_id = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [req.user.id, reviewNote, appealId]
      );

      await creditService.changeCredit(appeal.user_id, -3, '申诉失败额外处罚', req.user.id);
    }

    await query.run(
      'INSERT INTO notifications (user_id, title, content, notification_type) VALUES (?, ?, ?, ?)',
      [appeal.user_id, '申诉裁决', `您的${appeal.content_type}申诉已被${decision === 'approve' ? '通过' : '驳回'}: ${reviewNote}`, 'review']
    );

    res.json({ ok: true, message: `申诉已${decision === 'approve' ? '通过' : '驳回'}` });
  });

  router.get('/api/grades/classes', async (req, res) => {
    const grade = String(req.query.grade || '').trim();

    if (!grade) {
      res.status(400).json({ error: '缺少 grade 参数' });
      return;
    }

    if (!['G6', 'G7', 'G8'].includes(grade)) {
      res.json({ classes: [] });
      return;
    }

    const classes = await query.all(
      'SELECT * FROM grade_classes WHERE grade = ? ORDER BY class_name',
      [grade]
    );

    res.json({ classes });
  });

  router.get('/api/grade-context', async (req, res) => {
    const gradeContext = req.gradeContext || null;
    res.json({ gradeContext });
  });

  router.post('/api/grade-context', async (req, res) => {
    const { grade, class_name } = req.body;

    if (!grade) {
      res.status(400).json({ error: '缺少年级参数' });
      return;
    }

    if (!['G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12'].includes(grade)) {
      res.status(400).json({ error: '无效的年级' });
      return;
    }

    if (['G6', 'G7', 'G8'].includes(grade) && !class_name) {
      res.status(400).json({ error: 'G6-G8 必须选择班级' });
      return;
    }

    res.cookie('grade_context', JSON.stringify({ grade, class_name: class_name || null }), {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: false
    });

    res.json({ ok: true });
  });

  router.get('/api/admin/grades/classes', requireAuth, requireLevel(6), async (req, res) => {
    const grades = ['G6', 'G7', 'G8'];
    const classes = {};

    for (const grade of grades) {
      const classList = await query.all(
        'SELECT * FROM grade_classes WHERE grade = ? ORDER BY class_name',
        [grade]
      );
      classes[grade] = classList;
    }

    res.json({ classes, grades });
  });

  router.post('/api/admin/grades/classes', requireAuth, requireLevel(6), async (req, res) => {
    const { grade, class_name } = req.body;

    if (!['G6', 'G7', 'G8'].includes(grade)) {
      res.status(400).json({ error: '年级只能是 G6、G7 或 G8' });
      return;
    }

    if (!class_name || class_name.trim().length === 0) {
      res.status(400).json({ error: '班级名称不能为空' });
      return;
    }

    const classNameTrimmed = class_name.trim().toUpperCase();

    const existing = await query.get(
      'SELECT id FROM grade_classes WHERE grade = ? AND class_name = ?',
      [grade, classNameTrimmed]
    );

    if (existing) {
      res.status(400).json({ error: '该班级已存在' });
      return;
    }

    const result = await query.run(
      'INSERT INTO grade_classes (grade, class_name) VALUES (?, ?)',
      [grade, classNameTrimmed]
    );

    res.json({ ok: true, id: result.lastID, grade, class_name: classNameTrimmed });
  });

  router.put('/api/admin/grades/classes/:id', requireAuth, requireLevel(6), async (req, res) => {
    const classId = Number(req.params.id);
    const { class_name } = req.body;

    if (!class_name || class_name.trim().length === 0) {
      res.status(400).json({ error: '班级名称不能为空' });
      return;
    }

    const classNameTrimmed = class_name.trim().toUpperCase();

    const existing = await query.get('SELECT * FROM grade_classes WHERE id = ?', [classId]);
    if (!existing) {
      res.status(404).json({ error: '班级不存在' });
      return;
    }

    const duplicate = await query.get(
      'SELECT id FROM grade_classes WHERE grade = ? AND class_name = ? AND id != ?',
      [existing.grade, classNameTrimmed, classId]
    );

    if (duplicate) {
      res.status(400).json({ error: '该班级名称已存在' });
      return;
    }

    await query.run(
      'UPDATE grade_classes SET class_name = ? WHERE id = ?',
      [classNameTrimmed, classId]
    );

    res.json({ ok: true });
  });

  router.delete('/api/admin/grades/classes/:id', requireAuth, requireLevel(6), async (req, res) => {
    const classId = Number(req.params.id);

    const existing = await query.get('SELECT * FROM grade_classes WHERE id = ?', [classId]);
    if (!existing) {
      res.status(404).json({ error: '班级不存在' });
      return;
    }

    await query.run('DELETE FROM grade_classes WHERE id = ?', [classId]);

    res.json({ ok: true });
  });

  router.get('/api/admin/grades/subjects', requireAuth, requireLevel(6), async (req, res) => {
    const boards = await query.all('SELECT * FROM boards ORDER BY sort_order, name');
    const grades = ['G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12'];

    const permissions = {};
    for (const board of boards) {
      permissions[board.id] = {};
      for (const grade of grades) {
        const perm = await query.get(
          'SELECT * FROM subject_grade_permissions WHERE board_id = ? AND grade = ?',
          [board.id, grade]
        );
        permissions[board.id][grade] = perm ? { is_shared: perm.is_shared === 1 } : null;
      }
    }

    res.json({ boards, grades, permissions });
  });

  router.put('/api/admin/grades/subjects', requireAuth, requireLevel(6), async (req, res) => {
    const { board_id, grade, is_shared } = req.body;

    if (!board_id || !grade) {
      res.status(400).json({ error: '缺少必要参数' });
      return;
    }

    if (!['G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12'].includes(grade)) {
      res.status(400).json({ error: '无效的年级' });
      return;
    }

    const board = await query.get('SELECT id FROM boards WHERE id = ?', [board_id]);
    if (!board) {
      res.status(404).json({ error: '学科不存在' });
      return;
    }

    const existing = await query.get(
      'SELECT id FROM subject_grade_permissions WHERE board_id = ? AND grade = ?',
      [board_id, grade]
    );

    if (existing) {
      await query.run(
        'UPDATE subject_grade_permissions SET is_shared = ? WHERE id = ?',
        [is_shared ? 1 : 0, existing.id]
      );
    } else {
      await query.run(
        'INSERT INTO subject_grade_permissions (board_id, grade, is_shared) VALUES (?, ?, ?)',
        [board_id, grade, is_shared ? 1 : 0]
      );
    }

    res.json({ ok: true });
  });

  router.post('/api/admin/grades/subjects/batch', requireAuth, requireLevel(6), async (req, res) => {
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      res.status(400).json({ error: 'permissions 必须是数组' });
      return;
    }

    for (const perm of permissions) {
      const { board_id, grade, is_enabled, is_shared } = perm;

      if (!board_id || !grade) continue;

      if (!is_enabled) {
        await query.run(
          'DELETE FROM subject_grade_permissions WHERE board_id = ? AND grade = ?',
          [board_id, grade]
        );
        continue;
      }

      const existing = await query.get(
        'SELECT id FROM subject_grade_permissions WHERE board_id = ? AND grade = ?',
        [board_id, grade]
      );

      if (existing) {
        await query.run(
          'UPDATE subject_grade_permissions SET is_shared = ? WHERE id = ?',
          [is_shared ? 1 : 0, existing.id]
        );
      } else {
        await query.run(
          'INSERT INTO subject_grade_permissions (board_id, grade, is_shared) VALUES (?, ?, ?)',
          [board_id, grade, is_shared ? 1 : 0]
        );
      }
    }

    res.json({ ok: true });
  });

  router.post('/api/admin/subjects', requireAuth, requireLevel(6), async (req, res) => {
    const { name, color, slug } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: '学科名称不能为空' });
      return;
    }

    if (!slug || !slug.trim()) {
      res.status(400).json({ error: 'URL 标识不能为空' });
      return;
    }

    if (slug.trim().length > 50) {
      res.status(400).json({ error: 'URL 标识不能超过 50 个字符' });
      return;
    }

    if (!/^[a-z][a-z0-9_-]*$/.test(slug)) {
      res.status(400).json({ error: 'URL 标识只能包含英文小写字母、数字和连字符，且必须以字母开头' });
      return;
    }

    const validColor = color && /^#[0-9A-Fa-f]{6}$/.test(color) ? color.toUpperCase() : '#4f46e5';

    const existingSlug = await query.get('SELECT id FROM boards WHERE slug = ?', [slug]);
    if (existingSlug) {
      res.status(400).json({ error: '该 URL 标识已被使用' });
      return;
    }

    const existingName = await query.get('SELECT id FROM boards WHERE name = ?', [name.trim()]);
    if (existingName) {
      res.status(400).json({ error: '该学科名称已存在' });
      return;
    }

    const result = await query.run(
      'INSERT INTO boards (slug, name, color, sort_order) VALUES (?, ?, ?, 0)',
      [slug.trim(), name.trim(), validColor]
    );

    res.json({ ok: true, id: result.lastID });
  });

  router.put('/api/admin/subjects/:id', requireAuth, requireLevel(6), async (req, res) => {
    const subjectId = parseInt(req.params.id);
    const { name, color, slug } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: '学科名称不能为空' });
      return;
    }

    if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      res.status(400).json({ error: '颜色格式无效，请使用十六进制颜色值如 #4f46e5' });
      return;
    }

    if (slug && !/^[a-z][a-z0-9_-]*$/.test(slug)) {
      res.status(400).json({ error: 'URL 标识只能包含英文小写字母、数字和连字符，且必须以字母开头' });
      return;
    }

    if (slug && slug.trim().length > 50) {
      res.status(400).json({ error: 'URL 标识不能超过 50 个字符' });
      return;
    }

    const board = await query.get('SELECT * FROM boards WHERE id = ?', [subjectId]);
    if (!board) {
      res.status(404).json({ error: '学科不存在' });
      return;
    }

    if (slug && slug !== board.slug) {
      const existingSlug = await query.get('SELECT id FROM boards WHERE slug = ? AND id != ?', [slug, subjectId]);
      if (existingSlug) {
        res.status(400).json({ error: '该 URL 标识已被使用' });
        return;
      }
    }

    const existingName = await query.get('SELECT id FROM boards WHERE name = ? AND id != ?', [name.trim(), subjectId]);
    if (existingName) {
      res.status(400).json({ error: '该学科名称已存在' });
      return;
    }

    if (slug && slug !== board.slug) {
      await query.run(
        'UPDATE boards SET name = ?, color = ?, slug = ? WHERE id = ?',
        [name.trim(), color.toUpperCase(), slug.trim(), subjectId]
      );
    } else {
      await query.run(
        'UPDATE boards SET name = ?, color = ? WHERE id = ?',
        [name.trim(), color.toUpperCase(), subjectId]
      );
    }

    res.json({ ok: true });
  });

  router.delete('/api/admin/subjects/:id', requireAuth, requireLevel(6), async (req, res) => {
    const subjectId = parseInt(req.params.id);

    const board = await query.get('SELECT id FROM boards WHERE id = ?', [subjectId]);
    if (!board) {
      res.status(404).json({ error: '学科不存在' });
      return;
    }

    await query.run('DELETE FROM subject_grade_permissions WHERE board_id = ?', [subjectId]);
    await query.run('DELETE FROM board_sections WHERE board_id = ?', [subjectId]);
    await query.run('DELETE FROM boards WHERE id = ?', [subjectId]);

    res.json({ ok: true });
  });

  router.get('/grades', requireAuth, requireLevel(6), async (req, res) => {
    const boards = await query.all('SELECT * FROM boards ORDER BY sort_order, name');
    const grades = ['G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12'];
    const classes = {};

    for (const grade of ['G6', 'G7', 'G8']) {
      classes[grade] = await query.all(
        'SELECT * FROM grade_classes WHERE grade = ? ORDER BY class_name',
        [grade]
      );
    }

    const permissions = {};
    for (const board of boards) {
      permissions[board.id] = {};
      for (const grade of grades) {
        const perm = await query.get(
          'SELECT * FROM subject_grade_permissions WHERE board_id = ? AND grade = ?',
          [board.id, grade]
        );
        permissions[board.id][grade] = perm ? { is_shared: perm.is_shared === 1 } : null;
      }
    }

    res.render('admin/grades', {
      pageTitle: '年级班级管理',
      currentPath: '/grades',
      boards,
      grades,
      classes,
      permissions
    });
  });

  return router;
}

module.exports = createAdminRoutes;
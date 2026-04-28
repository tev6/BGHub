const express = require('express');
const bcrypt = require('bcryptjs');

function createApiRoutes({
  query,
  requireAuth,
  requireStaff,
  requireLevel,
  creditService,
  upload,
  getBoards,
  getBoardById,
  isStaff,
  validateEmail,
  getDashboardData,
  getForumPosts,
  getPostDetail,
  createOrUpdatePost,
  searchAll,
  auditContent,
  needsAIAudit,
  applyContentCredit,
  createReviewItem,
  canManagePost,
  formatDate,
  respondError,
  wantsJson
}) {
  const router = express.Router();

  function getUserLevel(user) {
    return Math.max(0, Number(user && user.role_level != null ? user.role_level : 0));
  }

  router.post('/auth/register', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim();
    const grade = String(req.body.grade || '').trim();
    const errors = [];

    if (!validateEmail(email)) {
      errors.push('请使用学校邮箱或 Gmail 邮箱注册');
    }

    if (name.length < 2) {
      errors.push('昵称至少需要 2 个字符');
    }

    if (!/^G(6|7|8|9|10|11|12)$/.test(grade)) {
      errors.push('年级仅支持 G6-G12');
    }

    if (password.length < 8) {
      errors.push('密码至少需要 8 位');
    }

    const exists = await query.get('SELECT id FROM users WHERE email = ?', [email]);
    if (exists) {
      errors.push('该邮箱已注册');
    }

    if (errors.length) {
      res.status(400).json({ errors });
      return;
    }

    const userCount = await query.get('SELECT COUNT(*) AS count FROM users');
    const role = userCount.count === 0 ? 'admin' : 'student';
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query.run(
      'INSERT INTO users (email, name, grade, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [email, name, grade, passwordHash, role]
    );

    req.session.userId = result.lastID;
    const user = await query.get('SELECT id, email, name, grade, role FROM users WHERE id = ?', [result.lastID]);
    res.status(201).json({ user });
  });

  router.post('/auth/login', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await query.get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: '邮箱或密码错误' });
      return;
    }

    req.session.userId = user.id;
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        grade: user.grade,
        role: user.role
      }
    });
  });

  router.post('/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  router.get('/dashboard', async (req, res) => {
    res.json(await getDashboardData(req.user));
  });

  router.get('/boards', async (req, res) => {
    res.json({ boards: await getBoards() });
  });

  router.get('/classes', async (req, res) => {
    const grade = req.query.grade || (req.gradeContext && req.gradeContext.grade);
    if (!grade) {
      res.json([]);
      return;
    }
    const classes = await query.all(
      'SELECT class_name FROM grade_classes WHERE grade = ? ORDER BY sort_order, class_name',
      [grade]
    );
    res.json(classes.map(c => c.class_name));
  });

  router.get('/forum/posts', async (req, res) => {
    res.json({
      posts: await getForumPosts({
        query: String(req.query.q || '').trim(),
        subject: String(req.query.subject || '').trim(),
        sort: String(req.query.sort || 'latest').trim(),
        type: String(req.query.type || '').trim()
      })
    });
  });

  router.post('/forum/posts', requireAuth, async (req, res) => {
    await createOrUpdatePost(req, res, 'create');
  });

  router.get('/forum/posts/:id', async (req, res) => {
    const detail = await getPostDetail(req.params.id);

    if (!detail) {
      res.status(404).json({ error: '帖子不存在' });
      return;
    }

    res.json(detail);
  });

  router.post('/forum/posts/:id/like', requireAuth, async (req, res) => {
    const postId = Number(req.params.id);
    const userId = req.user.id;

    const post = await query.get('SELECT id FROM posts WHERE id = ?', [postId]);
    if (!post) {
      res.status(404).json({ error: '帖子不存在' });
      return;
    }

    const existing = await query.get(
      'SELECT * FROM post_reactions WHERE post_id = ? AND user_id = ?',
      [postId, userId]
    );

    if (existing) {
      if (existing.reaction_type === 'like') {
        await query.run('DELETE FROM post_reactions WHERE id = ?', [existing.id]);
        await query.run('UPDATE posts SET like_count = MAX(0, like_count - 1) WHERE id = ?', [postId]);
        res.json({ liked: false, like_count: await query.get('SELECT like_count FROM posts WHERE id = ?', [postId]).then(r => r ? r.like_count : 0) });
      } else {
        await query.run('UPDATE post_reactions SET reaction_type = ? WHERE id = ?', ['like', existing.id]);
        await query.run('UPDATE posts SET like_count = like_count + 1, dislike_count = MAX(0, dislike_count - 1) WHERE id = ?', [postId]);
        const row = await query.get('SELECT like_count FROM posts WHERE id = ?', [postId]);
        res.json({ liked: true, like_count: row ? row.like_count : 0 });
      }
    } else {
      await query.run(
        'INSERT INTO post_reactions (post_id, user_id, reaction_type) VALUES (?, ?, ?)',
        [postId, userId, 'like']
      );
      await query.run('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', [postId]);
      const row = await query.get('SELECT like_count FROM posts WHERE id = ?', [postId]);
      res.json({ liked: true, like_count: row ? row.like_count : 0 });
    }
  });

  router.put('/forum/posts/:id', requireAuth, async (req, res) => {
    await createOrUpdatePost(req, res, 'edit');
  });

  router.delete('/forum/posts/:id', requireAuth, async (req, res) => {
    const detail = await getPostDetail(req.params.id);

    if (!detail || !canManagePost(req.user, detail.post)) {
      res.status(404).json({ error: '帖子不存在或没有权限删除' });
      return;
    }

    await query.run('DELETE FROM posts WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  router.post('/forum/posts/:id/comments', requireAuth, async (req, res) => {
    const content = String(req.body.content || '').trim();
    const detail = await getPostDetail(req.params.id);

    if (!detail) {
      res.status(404).json({ error: '帖子不存在' });
      return;
    }

    if (content.length < 2) {
      res.status(400).json({ error: '回复内容至少需要 2 个字符' });
      return;
    }

    const result = await query.run(`
      INSERT INTO comments (post_id, content, user_id)
      VALUES (?, ?, ?)
    `, [req.params.id, content, req.user.id]);

    const comment = await query.get(`
      SELECT comments.*, users.name AS author_name
      FROM comments
      JOIN users ON users.id = comments.user_id
      WHERE comments.id = ?
    `, [result.lastID]);

    if (detail.post.user_id !== req.user.id) {
      await query.run(
        'INSERT INTO notifications (user_id, title, content, notification_type) VALUES (?, ?, ?, ?)',
        [detail.post.user_id, '收到新回复', `有人在您的帖子"${detail.post.title}"下回复了`, 'interaction']
      );

      if (req.app.locals.sendToUser) {
        req.app.locals.sendToUser(detail.post.user_id, {
          type: 'notification',
          title: '收到新回复',
          content: `有人在您的帖子"${detail.post.title}"下回复了`
        });
      }
    }

    res.status(201).json({ comment });
  });

  router.get('/homeworks', async (req, res) => {
    const homeworks = await query.all(`
      SELECT homeworks.*, boards.name AS board_name, boards.slug AS board_slug,
             CASE WHEN homework_statuses.is_completed = 1 THEN 1 ELSE 0 END AS is_completed
      FROM homeworks
      JOIN boards ON boards.id = homeworks.board_id
      LEFT JOIN homework_statuses
        ON homework_statuses.homework_id = homeworks.id
       AND homework_statuses.user_id = ?
      ORDER BY datetime(homeworks.deadline) ASC
    `, [req.user ? req.user.id : -1]);
    res.json({ homeworks });
  });

  router.post('/homeworks', requireAuth, requireStaff, async (req, res) => {
    const boardId = Number(req.body.board_id || 0);
    const title = String(req.body.title || '').trim();
    const content = String(req.body.content || '').trim();
    const teacher = String(req.body.teacher || '').trim();
    const deadline = String(req.body.deadline || '').trim();
    const attachmentUrl = String(req.body.attachment_url || '').trim();
    const board = await getBoardById(boardId);

    if (!board || !title || !content || !deadline) {
      res.status(400).json({ error: '作业信息不完整' });
      return;
    }

    const result = await query.run(`
      INSERT INTO homeworks (board_id, title, content, teacher, deadline, attachment_url, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [boardId, title, content, teacher, deadline, attachmentUrl, req.user.id]);

    res.status(201).json({ homeworkId: result.lastID });
  });

  router.post('/homeworks/:id/toggle', requireAuth, async (req, res) => {
    const homework = await query.get('SELECT * FROM homeworks WHERE id = ?', [req.params.id]);

    if (!homework) {
      res.status(404).json({ error: '作业不存在' });
      return;
    }

    const existing = await query.get(`
      SELECT * FROM homework_statuses
      WHERE homework_id = ? AND user_id = ?
    `, [req.params.id, req.user.id]);

    if (existing && existing.is_completed === 1) {
      await query.run('UPDATE homework_statuses SET is_completed = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [existing.id]);
    } else if (existing) {
      await query.run('UPDATE homework_statuses SET is_completed = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [existing.id]);
    } else {
      await query.run('INSERT INTO homework_statuses (homework_id, user_id, is_completed) VALUES (?, ?, 1)', [req.params.id, req.user.id]);
    }

    const status = await query.get(`
      SELECT is_completed
      FROM homework_statuses
      WHERE homework_id = ? AND user_id = ?
    `, [req.params.id, req.user.id]);
    res.json({ is_completed: status ? status.is_completed === 1 : false });
  });

  router.get('/resources', async (req, res) => {
    const offset = Math.max(0, Number(req.query.offset || 0));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 50)));
    const resources = await query.all(`
      SELECT resources.*, boards.name AS board_name, boards.slug AS board_slug
      FROM resources
      JOIN boards ON boards.id = resources.board_id
      WHERE resources.status = 'approved'
      ORDER BY resources.like_count DESC, datetime(resources.created_at) DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    res.json({ resources });
  });

  router.post('/resources', requireAuth, upload.single('resourceFile'), async (req, res) => {
    const boardId = Number(req.body.board_id || 0);
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    const teacher = String(req.body.teacher || '').trim();
    const externalUrl = String(req.body.external_url || '').trim();
    const board = await getBoardById(boardId);
    const hasFile = Boolean(req.file);

    if (!board || !title || (!hasFile && !externalUrl)) {
      res.status(400).json({ error: '请至少提供标题与文件或资源链接' });
      return;
    }

    let initialStatus = 'pending';
    if (isStaff(req.user)) {
      initialStatus = 'approved';
    } else if (needsAIAudit(getUserLevel(req.user), 'resource')) {
      const auditResult = await auditContent(title, description, 'resource');
      if (!auditResult.passed) {
        res.status(403).json({ error: `内容违规：${auditResult.reason}` });
        return;
      }
      await applyContentCredit(req.user.id, 'resource', true);
      initialStatus = 'approved';
    }

    const filePath = hasFile ? `/uploads/${req.file.filename}` : '';
    const fileName = hasFile ? req.file.originalname : '';
    const result = await query.run(`
      INSERT INTO resources (
        board_id, title, description, teacher, file_name, file_path, external_url, status, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [boardId, title, description, teacher, fileName, filePath, externalUrl, initialStatus, req.user.id]);

    res.status(201).json({ resourceId: result.lastID, status: initialStatus });
  });

  router.post('/chat/messages', requireAuth, async (req, res) => {
    const content = String(req.body.content || '').trim();
    const userLevel = req.user.role_level;

    if (content.length < 1 || content.length > 200) {
      res.status(400).json({ error: '聊天内容需在 1-200 个字符之间' });
      return;
    }

    const creditInfo = await query.get('SELECT chat_cooldown_until, consecutive_rejects FROM user_credit WHERE user_id = ?', [req.user.id]);
    if (creditInfo && creditInfo.chat_cooldown_until) {
      const cooldownTime = new Date(creditInfo.chat_cooldown_until);
      if (cooldownTime > new Date()) {
        const remainingMinutes = Math.ceil((cooldownTime - new Date()) / 60000);
        res.status(429).json({
          error: '请等待冷却时间结束',
          cooldownMinutes: remainingMinutes
        });
        return;
      }
    }

    const needsReview = needsAIAudit(userLevel, 'chat');
    const initialStatus = needsReview ? 'pending' : 'approved';

    const result = await query.run(
      'INSERT INTO chat_messages (content, user_id, status, is_pending) VALUES (?, ?, ?, ?)',
      [content, req.user.id, initialStatus, needsReview ? 1 : 0]
    );

    const message = await query.get(`
      SELECT chat_messages.*, users.name AS author_name
      FROM chat_messages
      JOIN users ON users.id = chat_messages.user_id
      WHERE chat_messages.id = ?
    `, [result.lastID]);

    if (needsReview) {
      auditContent(content, '', 'chat').then(async (auditResult) => {
        if (!auditResult.passed) {
          await query.run(
            'UPDATE chat_messages SET is_rejected = 1, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?',
            [result.lastID]
          );

          const consecutiveRejects = (creditInfo?.consecutive_rejects || 0) + 1;
          const cooldownMinutes = Math.min(30, 5 * consecutiveRejects);

          await query.run(
            'UPDATE user_credit SET chat_cooldown_until = datetime(CURRENT_TIMESTAMP, ?), consecutive_rejects = ? WHERE user_id = ?',
            [`+${cooldownMinutes} minutes`, consecutiveRejects, req.user.id]
          );

          await applyContentCredit(req.user.id, 'chat', false);

          if (userLevel === 0) {
            req.app.locals.sendToUser && req.app.locals.sendToUser(req.user.id, {
              type: 'chat_rejected',
              messageId: result.lastID,
              reason: auditResult.reason,
              cooldownMinutes
            });
          }
        } else {
          await query.run(
            'UPDATE chat_messages SET status = "approved", is_pending = 0, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?',
            [result.lastID]
          );

          await query.run(
            'UPDATE user_credit SET consecutive_rejects = 0 WHERE user_id = ?',
            [req.user.id]
          );

          await applyContentCredit(req.user.id, 'chat', true);

          req.app.locals.sendToUser && req.app.locals.sendToUser(req.user.id, {
            type: 'chat_approved',
            messageId: result.lastID
          });
        }
      });

      if (userLevel === 0) {
        res.status(201).json({
          pending: true,
          messageId: result.lastID,
          message: '审核完成后可以发送下条消息'
        });
      } else {
        res.status(201).json({
          pending: true,
          messageId: result.lastID,
          message: '消息已提交审核'
        });
      }
    } else {
      res.status(201).json({
        message: {
          id: message.id,
          content: message.content,
          author_name: message.author_name,
          created_at: message.created_at,
          created_at_display: formatDate(message.created_at, true)
        }
      });
    }
  });

  router.get('/search', async (req, res) => {
    const term = String(req.query.q || '').trim();
    res.json({
      term,
      results: term ? await searchAll(term) : { posts: [], resources: [], exams: [], homeworks: [], sections: [] }
    });
  });

  router.get('/notifications', requireAuth, async (req, res) => {
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

  router.get('/notifications/unread-count', requireAuth, async (req, res) => {
    const row = await query.get(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ count: row.count });
  });

  router.post('/notifications/:id/read', requireAuth, async (req, res) => {
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

  router.post('/notifications/read-all', requireAuth, async (req, res) => {
    await query.run(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ ok: true });
  });

  return router;
}

module.exports = createApiRoutes;
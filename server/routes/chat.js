const express = require('express');

function createChatRoutes({
  query,
  requireAuth,
  setFlash,
  wantsJson,
  respondError,
  getUserLevel,
  auditContent,
  changeCredit,
  createReviewItem,
  incrementDailyCount
}) {
  const router = express.Router();

  router.get('/chat', async (req, res) => {
    await query.run(`
      DELETE FROM chat_messages
      WHERE datetime(created_at) < datetime('now', '-24 hours')
      AND is_rejected = 1
    `);

    const chatMessages = await query.all(`
      SELECT chat_messages.*, 
             COALESCE(users.name, '游客' || COALESCE(chat_messages.guest_id, '')) AS author_name
      FROM chat_messages
      LEFT JOIN users ON users.id = chat_messages.user_id
      WHERE chat_messages.status IN ('approved', 'visible_pending') AND chat_messages.is_rejected = 0
      AND datetime(chat_messages.created_at) > datetime('now', '-24 hours')
      ORDER BY datetime(chat_messages.created_at) ASC
    `);

    res.render('chat', {
      pageTitle: '聊天',
      currentPath: '/chat',
      chatMessages,
      user: req.user
    });
  });

  router.post('/chat/messages', requireAuth, async (req, res) => {
    const content = String(req.body.content || '').trim();
    const userLevel = getUserLevel(req.user);

    if (content.length < 1 || content.length > 200) {
      respondError(req, res, 400, '聊天内容需在 1-200 个字符之间');
      return;
    }

    if (userLevel === 0 || userLevel === 1) {
      const auditResult = await auditContent(content, '', 'chat');
      if (!auditResult.passed) {
        await query.run(
          'INSERT INTO chat_messages (content, user_id, status, is_rejected) VALUES (?, ?, ?, ?)',
          [content, req.user.id, 'rejected', 1]
        );
        await changeCredit(req.user.id, -3, '聊天消息AI审核不通过', null);
        respondError(req, res, 403, `内容违规：${auditResult.reason}`);
        return;
      }
      await query.run(
        'INSERT INTO chat_messages (content, user_id, status) VALUES (?, ?, ?)',
        [content, req.user.id, 'approved']
      );
      await incrementDailyCount(req.user.id, 'chat');
      await changeCredit(req.user.id, 1, '聊天消息通过AI审核', null);

      if (wantsJson(req)) {
        res.status(201).json({ ok: true });
        return;
      }
      res.redirect('/chat');
      return;
    }

    if (userLevel >= 2) {
      await query.run(
        'INSERT INTO chat_messages (content, user_id, status) VALUES (?, ?, ?)',
        [content, req.user.id, 'approved']
      );
      await incrementDailyCount(req.user.id, 'chat');

      if (wantsJson(req)) {
        res.status(201).json({ ok: true });
        return;
      }

      res.redirect('/chat');
      return;
    }
  });

  router.post('/chat/messages/:id/delete', requireAuth, async (req, res) => {
    const messageId = Number(req.params.id);
    const userLevel = getUserLevel(req.user);

    const message = await query.get('SELECT * FROM chat_messages WHERE id = ?', [messageId]);

    if (!message) {
      respondError(req, res, 404, '消息不存在');
      return;
    }

    const canDelete = message.user_id === req.user.id || userLevel === 6;

    if (!canDelete) {
      respondError(req, res, 403, '没有权限删除此消息');
      return;
    }

    await query.run('DELETE FROM chat_messages WHERE id = ?', [messageId]);

    if (wantsJson(req)) {
      res.json({ ok: true });
      return;
    }

    res.redirect('/chat');
  });

  return router;
}

module.exports = createChatRoutes;
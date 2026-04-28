const express = require('express');

function createHomeworksRoutes({
  query,
  requireAuth,
  requireLevel,
  setFlash,
  wantsJson,
  getUserLevel,
  needsAIAudit,
  auditContent,
  applyContentCredit,
  createReviewItem
}) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.redirect('/');
  });

  router.post('/', requireAuth, async (req, res) => {
    const userLevel = getUserLevel(req.user);

    if (userLevel === 0) {
      if (wantsJson(req)) {
        res.status(403).json({ error: 'LV0 用户不能发布作业' });
        return;
      }
      setFlash(req, 'error', 'LV0 用户不能发布作业');
      res.redirect('/homeworks');
      return;
    }

    const boardId = Number(req.body.board_id || 0);
    const title = String(req.body.title || '').trim();
    const content = String(req.body.content || '').trim();
    const teacher = String(req.body.teacher || '').trim();
    const deadline = String(req.body.deadline || '').trim();
    const attachmentUrl = String(req.body.attachment_url || '').trim();
    const board = await query.get('SELECT * FROM boards WHERE id = ?', [boardId]);

    if (!board || !title || !content || !deadline) {
      if (wantsJson(req)) {
        res.status(400).json({ error: '作业信息不完整' });
        return;
      }
      setFlash(req, 'error', '作业信息不完整');
      res.redirect('/homeworks');
      return;
    }

    let status = 'approved';

    if (needsAIAudit(userLevel, 'homework')) {
      const auditResult = await auditContent(title, content, 'homework');
      if (!auditResult.passed) {
        if (wantsJson(req)) {
          res.status(403).json({ error: `内容违规：${auditResult.reason}` });
          return;
        }
        res.status(403).render('homeworks', {
          pageTitle: '作业看板',
          errors: [`内容违规：${auditResult.reason}`]
        });
        return;
      }
      await applyContentCredit(req.user.id, 'homework', true);

      if (userLevel >= 1 && userLevel <= 2) {
        status = 'pending';
      }
    }

    const result = await query.run(`
      INSERT INTO homeworks (board_id, title, content, teacher, deadline, attachment_url, created_by, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [boardId, title, content, teacher, deadline, attachmentUrl, req.user.id, status]);

    if (status === 'pending') {
      await createReviewItem('homework', result.lastID, req.user.id, true);
    }

    if (wantsJson(req)) {
      res.status(201).json({ ok: true, status });
      return;
    }

    setFlash(req, 'success', status === 'pending' ? '作业已提交，等待审核' : '作业已创建');
    res.redirect('/homeworks');
  });

  router.post('/:id/toggle', requireAuth, async (req, res) => {
    const homework = await query.get('SELECT * FROM homeworks WHERE id = ?', [req.params.id]);

    if (!homework) {
      if (wantsJson(req)) {
        res.status(404).json({ error: '作业不存在' });
        return;
      }
      setFlash(req, 'error', '作业不存在');
      res.redirect('/homeworks');
      return;
    }

    const existing = await query.get(`
      SELECT * FROM homework_statuses
      WHERE homework_id = ? AND user_id = ?
    `, [req.params.id, req.user.id]);

    if (existing && existing.is_completed === 1) {
      await query.run(`
        UPDATE homework_statuses
        SET is_completed = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [existing.id]);
    } else if (existing) {
      await query.run(`
        UPDATE homework_statuses
        SET is_completed = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [existing.id]);
    } else {
      await query.run(`
        INSERT INTO homework_statuses (homework_id, user_id, is_completed)
        VALUES (?, ?, 1)
      `, [req.params.id, req.user.id]);
    }

    if (wantsJson(req)) {
      const status = await query.get(`
        SELECT is_completed
        FROM homework_statuses
        WHERE homework_id = ? AND user_id = ?
      `, [req.params.id, req.user.id]);
      res.json({ is_completed: status ? status.is_completed === 1 : false });
      return;
    }

    setFlash(req, 'success', '作业状态已更新');
    res.redirect('/homeworks');
  });

  return router;
}

module.exports = createHomeworksRoutes;
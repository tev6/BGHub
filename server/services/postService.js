function createPostService({
  query,
  getBoards,
  getBoardById,
  getPostDetail,
  canManagePost,
  respondError,
  wantsJson,
  setFlash,
  getUserLevel,
  needsAIAudit,
  auditContent,
  applyContentCredit,
  createReviewItem
}) {
  async function createOrUpdatePost(req, res, mode) {
    const title = String(req.body.title || '').trim();
    const content = String(req.body.content || '').trim();
    const isAnonymous = req.body.is_anonymous ? 1 : 0;
    const errors = [];
    const boards = await getBoards();
    const boardId = Number(req.body.board_id || 0);
    const board = boardId ? await getBoardById(boardId) : null;

    if (boardId && !board) {
      errors.push('请选择有效的学科板块');
    }

    if (title.length < 4) {
      errors.push('标题至少需要 4 个字符');
    }

    if (content.length < 10) {
      errors.push('正文至少需要 10 个字符');
    }

    let existingPost = null;

    if (mode === 'edit') {
      existingPost = await getPostDetail(req.params.id);
      if (!existingPost || !canManagePost(req.user, existingPost.post)) {
        respondError(req, res, 404, '帖子不存在或没有权限编辑');
        return;
      }
    }

    if (errors.length) {
      if (wantsJson(req)) {
        res.status(400).json({ errors });
        return;
      }

      res.status(400).render('forum-form', {
        pageTitle: mode === 'edit' ? '编辑帖子' : '发布帖子',
        boards,
        mode,
        post: mode === 'edit'
          ? { ...existingPost.post, title, content, board_id: boardId, is_anonymous: isAnonymous }
          : { title, content, board_id: boardId, is_anonymous: isAnonymous },
        errors
      });
      return;
    }

    const level = getUserLevel(req.user);

    if (level <= 1) {
      if (wantsJson(req)) {
        res.status(403).json({ error: '您的等级无法发帖' });
        return;
      }
      res.status(403).render('error', {
        pageTitle: '无法发帖',
        message: 'LV0/LV1 用户不能发布帖子'
      });
      return;
    }

    if (mode === 'edit') {
      await query.run(`
        UPDATE posts
        SET board_id = ?, title = ?, content = ?, is_anonymous = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [boardId || null, title, content, isAnonymous, req.params.id]);

      if (wantsJson(req)) {
        const detail = await getPostDetail(req.params.id);
        res.json({ post: detail.post });
        return;
      }

      setFlash(req, 'success', '帖子已更新');
      res.redirect(`/forum/${req.params.id}`);
      return;
    }

    if (needsAIAudit(level, 'post')) {
      const auditResult = await auditContent(title, content, 'post');
      if (!auditResult.passed) {
        if (wantsJson(req)) {
          res.status(403).json({ errors: [`内容违规：${auditResult.reason}`] });
          return;
        }
        res.status(403).render('forum-form', {
          pageTitle: '发布帖子',
          boards,
          mode: 'create',
          post: { title, content, board_id: boardId, is_anonymous: isAnonymous },
          errors: [`内容违规：${auditResult.reason}`]
        });
        return;
      }
      await applyContentCredit(req.user.id, 'post', true);
    }

    let reviewStatus;
    let needsHumanReview = false;
    if (level >= 4) {
      reviewStatus = 'approved';
    } else if (level >= 2) {
      reviewStatus = 'pending';
      needsHumanReview = true;
    } else {
      reviewStatus = 'pending';
    }
    const result = await query.run(`
      INSERT INTO posts (board_id, title, content, is_anonymous, user_id, review_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [boardId || null, title, content, isAnonymous, req.user.id, reviewStatus]);

    if (needsHumanReview) {
      await createReviewItem('post', result.lastID, req.user.id, true);
    } else if (level < 2) {
      await createReviewItem('post', result.lastID, req.user.id, false);
    }

    if (wantsJson(req)) {
      const detail = await getPostDetail(result.lastID);
      res.status(201).json({ post: detail.post });
      return;
    }

    setFlash(req, 'success', reviewStatus === 'approved' ? '帖子已发布' : '帖子已提交审核');
    res.redirect(`/forum/${result.lastID}`);
  }

  return {
    createOrUpdatePost
  };
}

module.exports = { createPostService };

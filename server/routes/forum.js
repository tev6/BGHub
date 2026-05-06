const express = require('express');
const { createPostService } = require('../services/postService');

function createForumRoutes({
  query,
  requireAuth,
  requireStaff,
  renderMarkdown,
  creditService,
  getBoards,
  formatDate,
  isStaff,
  ensureColumn,
  setFlash,
  canManagePost,
  canMarkBestAnswer,
  wantsJson,
  respondError,
  getUserLevel,
  needsAIAudit,
  auditContent,
  applyContentCredit,
  createReviewItem,
  getPostDetail,
  runTransaction
}) {
  const router = express.Router();

  async function getForumPosts(filters = {}) {
    const conditions = [];
    const params = [];

    conditions.push("posts.review_status = 'approved'");

    if (filters.subject) {
      conditions.push('boards.slug = ?');
      params.push(filters.subject);
    }

    if (filters.query) {
      conditions.push('(posts.title LIKE ? OR posts.content LIKE ?)');
      params.push(`%${filters.query}%`, `%${filters.query}%`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = filters.sort === 'hot'
      ? 'comment_count DESC, posts.view_count DESC, datetime(posts.updated_at) DESC'
      : 'datetime(posts.created_at) DESC';

    return query.all(`
      SELECT posts.*, boards.name AS board_name, boards.slug AS board_slug,
             users.name AS author_name,
             COUNT(comments.id) AS comment_count
      FROM posts
      LEFT JOIN boards ON boards.id = posts.board_id
      JOIN users ON users.id = posts.user_id
      LEFT JOIN comments ON comments.post_id = posts.id
      ${whereClause}
      GROUP BY posts.id
      ORDER BY ${orderBy}
    `, params);
  }

  async function getPostDetail(postId) {
    const post = await query.get(`
      SELECT posts.*, boards.name AS board_name, boards.slug AS board_slug,
             users.name AS author_name, users.email AS author_email
      FROM posts
      LEFT JOIN boards ON boards.id = posts.board_id
      JOIN users ON users.id = posts.user_id
      WHERE posts.id = ?
    `, [postId]);

    if (!post) {
      return null;
    }

    const comments = await query.all(`
      SELECT comments.*, users.name AS author_name
      FROM comments
      JOIN users ON users.id = comments.user_id
      WHERE comments.post_id = ?
      ORDER BY comments.is_best DESC, datetime(comments.created_at) ASC
    `, [postId]);

    return { post, comments };
  }

  function getUserLevel(user) {
    return Math.max(0, Number(user && user.role_level != null ? user.role_level : 0));
  }

  function canManagePost(user, post) {
    return Boolean(user && (user.id === post.user_id || isStaff(user)));
  }

  function canMarkBestAnswer(user, post) {
    return Boolean(user && (user.id === post.user_id || isStaff(user)));
  }

  function wantsJson(req) {
    return req.path.startsWith('/api/');
  }

  function respondError(req, res, statusCode, message) {
    if (wantsJson(req)) {
      res.status(statusCode).json({ error: message });
      return;
    }

    if (statusCode >= 500) {
      res.status(statusCode).render('error', {
        pageTitle: '系统错误',
        statusCode: statusCode,
        message: message,
        user: req.user
      });
      return;
    }

    res.status(statusCode).render('error', {
      pageTitle: '出错了',
      statusCode: statusCode,
      message: message,
      user: req.user
    });
  }

  function setFlash(req, type, message) {
    req.session.flash = { type, message };
  }

  async function getBoardById(boardId) {
    return query.get('SELECT * FROM boards WHERE id = ?', [boardId]);
  }

  function needsAIAudit(userLevel, type) {
    const level = Number(userLevel || 0);

    if (level >= 3) {
      return false;
    }

    switch (type) {
      case 'chat':
        return level <= 1;
      case 'cj':
        return level <= 1;
      case 'post':
        return level <= 2;
      case 'resource':
        return level <= 2;
      default:
        return false;
    }
  }

  async function createReviewItem(itemType, itemId, userId, aiReviewed = false) {
    const result = await query.run(
      'INSERT INTO review_items (item_type, item_id, created_by, ai_reviewed) VALUES (?, ?, ?, ?)',
      [itemType, itemId, userId, aiReviewed ? 1 : 0]
    );
    return result.lastID;
  }

  const AUDIT_CREDIT_REWARDS = {
    post: 2,
    resource: 3,
    cj: 5
  };

  async function applyContentCredit(userId, type, approved) {
    const creditType = type === 'cj' ? 'cj' : type;
    const delta = approved
      ? (AUDIT_CREDIT_REWARDS[creditType] || 0)
      : -10;

    if (delta === 0) {
      return { credit: 0, delta: 0, skipped: true };
    }

    const reason = approved
      ? `${type}审核通过奖励`
      : `${type}审核失败扣减`;

    if (creditService && typeof creditService.changeCredit === 'function') {
      return creditService.changeCredit(userId, delta, reason, null);
    }

    return { credit: 0, delta: 0, skipped: true };
  }

  const postService = createPostService({
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
  });

  router.get('/', async (req, res) => {
    const boards = await getBoards();
    const posts = await getForumPosts({
      query: String(req.query.q || '').trim(),
      subject: String(req.query.subject || '').trim(),
      sort: String(req.query.sort || 'latest').trim(),
      type: String(req.query.type || '').trim()
    });

    res.render('forum', {
      pageTitle: '文章',
      boards,
      posts,
      filters: {
        q: String(req.query.q || '').trim(),
        subject: String(req.query.subject || '').trim(),
        sort: String(req.query.sort || 'latest').trim(),
        type: String(req.query.type || '').trim()
      }
    });
  });

  router.get('/new', requireAuth, async (req, res) => {
    const boards = await getBoards();
    res.render('forum-form', {
      pageTitle: '发布帖子',
      boards,
      mode: 'create',
      post: null,
      errors: []
    });
  });

  router.get('/:id/edit', requireAuth, async (req, res) => {
    const detail = await getPostDetail(req.params.id);

    if (!detail || !canManagePost(req.user, detail.post)) {
      respondError(req, res, 404, '帖子不存在或没有权限编辑');
      return;
    }

    const boards = await getBoards();
    res.render('forum-form', {
      pageTitle: '编辑帖子',
      boards,
      mode: 'edit',
      post: detail.post,
      errors: []
    });
  });

  router.post('/posts', requireAuth, async (req, res) => {
    await postService.createOrUpdatePost(req, res, 'create');
  });

  router.post('/:id/edit', requireAuth, async (req, res) => {
    await postService.createOrUpdatePost(req, res, 'edit');
  });

  router.get('/:id', async (req, res) => {
    const detail = await getPostDetail(req.params.id);

    if (!detail) {
      respondError(req, res, 404, '帖子不存在');
      return;
    }

    if (detail.post.review_status !== 'approved' && !(req.user && (req.user.id === detail.post.user_id || isStaff(req.user)))) {
      respondError(req, res, 404, '帖子不存在');
      return;
    }

    await query.run('UPDATE posts SET view_count = view_count + 1 WHERE id = ?', [req.params.id]);
    const boards = await getBoards();
    res.render('forum-detail', {
      pageTitle: detail.post.title,
      boards,
      post: {
        ...detail.post,
        view_count: detail.post.view_count + 1
      },
      comments: detail.comments
    });
  });

  router.post('/:id/comments', requireAuth, async (req, res) => {
    const content = String(req.body.content || '').trim();
    const detail = await getPostDetail(req.params.id);

    if (!detail) {
      respondError(req, res, 404, '帖子不存在');
      return;
    }

    if (content.length < 2) {
      respondError(req, res, 400, '回复内容至少需要 2 个字符');
      return;
    }

    const result = await query.run(`
      INSERT INTO comments (post_id, content, user_id)
      VALUES (?, ?, ?)
    `, [req.params.id, content, req.user.id]);

    if (wantsJson(req)) {
      const comment = await query.get(`
        SELECT comments.*, users.name AS author_name
        FROM comments
        JOIN users ON users.id = comments.user_id
        WHERE comments.id = ?
      `, [result.lastID]);
      res.status(201).json({ comment });
      return;
    }

    setFlash(req, 'success', '回复已发布');
    res.redirect(`/forum/${req.params.id}`);
  });

  router.post('/:postId/comments/:commentId/best', requireAuth, async (req, res) => {
    const detail = await getPostDetail(req.params.postId);

    if (!detail || !canMarkBestAnswer(req.user, detail.post)) {
      respondError(req, res, 404, '帖子不存在或没有权限操作');
      return;
    }

    await query.run('UPDATE comments SET is_best = 0 WHERE post_id = ?', [req.params.postId]);
    await query.run('UPDATE comments SET is_best = 1 WHERE id = ? AND post_id = ?', [req.params.commentId, req.params.postId]);
    setFlash(req, 'success', '已设置为最佳答案');
    res.redirect(`/forum/${req.params.postId}`);
  });

  router.post('/:id/delete', requireAuth, async (req, res) => {
    const detail = await getPostDetail(req.params.id);

    if (!detail || !canManagePost(req.user, detail.post)) {
      respondError(req, res, 404, '帖子不存在或没有权限删除');
      return;
    }

    await query.run('DELETE FROM posts WHERE id = ?', [req.params.id]);

    if (wantsJson(req)) {
      res.json({ ok: true });
      return;
    }

    setFlash(req, 'success', '帖子已删除');
    res.redirect('/forum');
  });

  return { router, postService };
}

module.exports = createForumRoutes;

const express = require('express');

function createResourcesRoutes({ query, requireAuth, requireLevel, upload, formatDate, buildCountdown, ensureColumn, getBoards, getBoardById, isStaff, wantsJson, setFlash, respondError, getUserLevel, createReviewItem }) {
  const router = express.Router();

  router.get('/new', requireAuth, (req, res, next) => {
    const userLevel = getUserLevel(req.user);
    if (userLevel < 4) {
      if (wantsJson(req)) {
        res.status(403).json({ error: '您的等级不足以访问资源上传功能，请提升信用分后再试' });
        return;
      }
      return res.status(403).render('error-permission-resource', {
        pageTitle: '权限不足',
        statusCode: 403,
        message: null
      });
    }
    next();
  }, async (req, res) => {
    const boards = await getBoards();
    res.render('resources-form', {
      pageTitle: '上传资源',
      currentPath: '/resources/new',
      boards,
      isNew: true,
      errors: [],
      formData: {}
    });
  });

  router.get('/', async (req, res) => {
    const boards = await getBoards();
    const filters = {
      subject: String(req.query.subject || '').trim(),
      q: String(req.query.q || '').trim()
    };
    const conditions = ['(resources.status = \'approved\' OR resources.uploaded_by = ?)'];
    const params = [req.user ? req.user.id : -1];

    if (filters.subject) {
      conditions.push('boards.slug = ?');
      params.push(filters.subject);
    }

    if (filters.q) {
      conditions.push('(resources.title LIKE ? OR resources.description LIKE ? OR resources.teacher LIKE ?)');
      params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
    }

    const resources = await query.all(`
      SELECT resources.*, boards.name AS board_name, boards.slug AS board_slug,
             users.name AS uploader_name
      FROM resources
      JOIN boards ON boards.id = resources.board_id
      LEFT JOIN users ON users.id = resources.uploaded_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY resources.like_count DESC, datetime(resources.created_at) DESC
    `, params);

    res.render('resources', {
      pageTitle: '课件库',
      boards,
      resources,
      filters
    });
  });

  router.post('/', requireAuth, requireLevel(4), upload.single('resourceFile'), async (req, res) => {
    const boardId = Number(req.body.board_id || 0);
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    const teacher = String(req.body.teacher || '').trim();
    const externalUrl = String(req.body.external_url || '').trim();
    const board = await getBoardById(boardId);
    const hasFile = Boolean(req.file);
    const status = req.user.role_level >= 5 ? 'approved' : 'pending';

    if (!board || !title || (!hasFile && !externalUrl)) {
      respondError(req, res, 400, '请至少提供标题与文件或资源链接');
      return;
    }

    const filePath = hasFile ? `/uploads/${req.file.filename}` : '';
    const fileName = hasFile ? req.file.originalname : '';

    await query.run(`
      INSERT INTO resources (
        board_id, title, description, teacher, file_name, file_path, external_url, status, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [boardId, title, description, teacher, fileName, filePath, externalUrl, status, req.user.id]);

    if (status === 'pending') {
      await createReviewItem('resource', result.lastID, req.user.id, true);
    }

    if (wantsJson(req)) {
      res.status(201).json({ ok: true, status });
      return;
    }

    setFlash(req, 'success', status === 'approved' ? '资源已上传' : '资源已提交，等待审核');
    res.redirect('/resources');
  });

  router.get('/:id/download', async (req, res) => {
    const resource = await query.get('SELECT * FROM resources WHERE id = ?', [req.params.id]);

    if (!resource || resource.status !== 'approved') {
      respondError(req, res, 404, '资源不存在');
      return;
    }

    await query.run('UPDATE resources SET download_count = download_count + 1 WHERE id = ?', [req.params.id]);

    if (resource.external_url) {
      res.redirect(resource.external_url);
      return;
    }

    if (resource.file_path) {
      res.redirect(resource.file_path);
      return;
    }

    respondError(req, res, 404, '资源文件不存在');
  });

  router.post('/:id/like', requireAuth, async (req, res) => {
    if (req.user.role_level === 0) {
      respondError(req, res, 403, 'LV0用户无法点赞，请先登录升级为LV1');
      return;
    }

    const resource = await query.get('SELECT * FROM resources WHERE id = ?', [req.params.id]);

    if (!resource) {
      respondError(req, res, 404, '资源不存在');
      return;
    }

    const existingLike = await query.get(
      'SELECT id FROM resource_likes WHERE resource_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (existingLike) {
      await query.run('DELETE FROM resource_likes WHERE id = ?', [existingLike.id]);
      await query.run('UPDATE resources SET like_count = like_count - 1 WHERE id = ?', [req.params.id]);
    } else {
      await query.run('INSERT INTO resource_likes (resource_id, user_id) VALUES (?, ?)', [req.params.id, req.user.id]);
      await query.run('UPDATE resources SET like_count = like_count + 1 WHERE id = ?', [req.params.id]);
    }

    if (wantsJson(req)) {
      const latest = await query.get('SELECT like_count FROM resources WHERE id = ?', [req.params.id]);
      const hasLiked = !existingLike;
      res.json({ like_count: latest.like_count, has_liked: hasLiked });
      return;
    }

    res.redirect('/resources');
  });

  return router;
}

module.exports = createResourcesRoutes;
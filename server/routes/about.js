const express = require('express');

const SLUG_REGEX = /^[a-z0-9][a-z0-9_-]{1,48}[a-z0-9]$|^[a-z0-9]{2,50}$/;

function createAboutRoutes({ query, requireAuth, requireLevel, renderMarkdown, respondError, wantsJson, setFlash }) {
  const router = express.Router();

  function validateSlug(slug) {
    if (!slug || typeof slug !== 'string') return false;
    if (slug.length < 3 || slug.length > 50) return false;
    if (!SLUG_REGEX.test(slug)) return false;
    return true;
  }

  async function getAboutPages(options = {}) {
    const { publishedOnly = true } = options;
    let sql = 'SELECT * FROM about_pages';
    const params = [];

    if (publishedOnly) {
      sql += ' WHERE is_published = 1';
    }

    sql += ' ORDER BY sort_order ASC, created_at DESC';
    return query.all(sql, params);
  }

  async function getAboutPageBySlug(slug) {
    return query.get('SELECT * FROM about_pages WHERE slug = ? AND is_published = 1', [slug]);
  }

  async function getAboutPageById(id) {
    return query.get('SELECT * FROM about_pages WHERE id = ?', [id]);
  }

  async function slugExists(slug, excludeId = null) {
    if (excludeId) {
      const row = await query.get('SELECT id FROM about_pages WHERE slug = ? AND id != ?', [slug, excludeId]);
      return !!row;
    }
    const row = await query.get('SELECT id FROM about_pages WHERE slug = ?', [slug]);
    return !!row;
  }

  router.get('/', async (req, res) => {
    const pages = await getAboutPages({ publishedOnly: true });

    res.render('about/index', {
      pageTitle: res.locals.locale === 'en' ? 'About' : '关于',
      currentPath: '/about',
      pages,
      user: req.user
    });
  });

  router.get('/new', requireAuth, requireLevel(6), async (req, res) => {
    res.render('about/form', {
      pageTitle: res.locals.locale === 'en' ? 'New About Page' : '新建关于页面',
      currentPath: '/about',
      mode: 'create',
      page: null,
      errors: null,
      user: req.user
    });
  });

  router.get('/:slug', async (req, res) => {
    const page = await getAboutPageBySlug(req.params.slug);
    if (!page) {
      if (wantsJson(req)) {
        return res.status(404).json({ error: 'Page not found' });
      }
      return respondError(req, res, 404, res.locals.locale === 'en' ? 'Page not found' : '页面不存在');
    }

    res.render('about/detail', {
      pageTitle: page.title,
      currentPath: '/about',
      page,
      renderMarkdown,
      user: req.user
    });
  });

  router.get('/:slug/edit', requireAuth, requireLevel(6), async (req, res) => {
    const page = await getAboutPageBySlug(req.params.slug);
    if (!page) {
      return respondError(req, res, 404, 'Page not found');
    }

    res.render('about/form', {
      pageTitle: res.locals.locale === 'en' ? 'Edit Page' : '编辑页面',
      currentPath: '/about',
      mode: 'edit',
      page,
      errors: null,
      user: req.user
    });
  });

  router.post('/', requireAuth, requireLevel(6), async (req, res) => {
    const { slug, title, content, is_published, sort_order } = req.body;
    const errors = [];

    if (!validateSlug(slug)) {
      errors.push(res.locals.locale === 'en'
        ? 'URL slug must be 3-50 characters, containing only letters, numbers, hyphens and underscores'
        : 'URL后缀必须是3-50个字符，只能包含字母、数字、连字符和下划线');
    }

    if (!title || title.trim().length < 2) {
      errors.push(res.locals.locale === 'en' ? 'Title must be at least 2 characters' : '标题至少需要2个字符');
    }

    if (content && content.length > 100000) {
      errors.push(res.locals.locale === 'en' ? 'Content is too long' : '内容过长');
    }

    const published = is_published ? 1 : 0;
    const order = parseInt(sort_order, 10) || 0;

    if (errors.length > 0) {
      if (wantsJson(req)) {
        return res.status(400).json({ errors });
      }
      return res.render('about/form', {
        pageTitle: res.locals.locale === 'en' ? 'New About Page' : '新建关于页面',
        currentPath: '/about',
        mode: 'create',
        page: { slug, title, content, is_published: published, sort_order: order },
        errors,
        user: req.user
      });
    }

    const exists = await slugExists(slug);
    if (exists) {
      errors.push(res.locals.locale === 'en' ? 'This URL slug is already in use' : '此URL后缀已被使用');
      return res.render('about/form', {
        pageTitle: res.locals.locale === 'en' ? 'New About Page' : '新建关于页面',
        currentPath: '/about',
        mode: 'create',
        page: { slug, title, content, is_published: published, sort_order: order },
        errors,
        user: req.user
      });
    }

    const result = await query.run(
      `INSERT INTO about_pages (slug, title, content, is_published, sort_order, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [slug, title.trim(), content || '', published, order, req.user.id, req.user.id]
    );

    if (wantsJson(req)) {
      return res.status(201).json({ id: result.lastID, slug });
    }

    setFlash(req, 'success', res.locals.locale === 'en' ? 'Page created successfully' : '页面创建成功');
    res.redirect(`/about/${slug}`);
  });

  router.post('/:slug/edit', requireAuth, requireLevel(6), async (req, res) => {
    const page = await getAboutPageBySlug(req.params.slug);
    if (!page) {
      return respondError(req, res, 404, 'Page not found');
    }

    const { title, content, is_published, sort_order } = req.body;
    const errors = [];

    if (!title || title.trim().length < 2) {
      errors.push(res.locals.locale === 'en' ? 'Title must be at least 2 characters' : '标题至少需要2个字符');
    }

    if (content && content.length > 100000) {
      errors.push(res.locals.locale === 'en' ? 'Content is too long' : '内容过长');
    }

    const published = is_published ? 1 : 0;
    const order = parseInt(sort_order, 10) || 0;

    if (errors.length > 0) {
      return res.render('about/form', {
        pageTitle: res.locals.locale === 'en' ? 'Edit Page' : '编辑页面',
        currentPath: '/about',
        mode: 'edit',
        page: { ...page, title, content, is_published: published, sort_order: order },
        errors,
        user: req.user
      });
    }

    await query.run(
      `UPDATE about_pages SET title = ?, content = ?, is_published = ?, sort_order = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [title.trim(), content || '', published, order, req.user.id, page.id]
    );

    if (wantsJson(req)) {
      return res.json({ ok: true, slug: page.slug });
    }

    setFlash(req, 'success', res.locals.locale === 'en' ? 'Page updated successfully' : '页面更新成功');
    res.redirect(`/about/${page.slug}`);
  });

  router.post('/:slug/delete', requireAuth, requireLevel(6), async (req, res) => {
    const page = await getAboutPageBySlug(req.params.slug);
    if (!page) {
      return respondError(req, res, 404, 'Page not found');
    }

    await query.run('DELETE FROM about_pages WHERE id = ?', [page.id]);

    if (wantsJson(req)) {
      return res.json({ ok: true });
    }

    setFlash(req, 'success', res.locals.locale === 'en' ? 'Page deleted successfully' : '页面删除成功');
    res.redirect('/about');
  });

  router.get('/api/list', async (req, res) => {
    const pages = await getAboutPages({ publishedOnly: true });
    res.json({ pages });
  });

  router.get('/api/:slug', async (req, res) => {
    const page = await getAboutPageBySlug(req.params.slug);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    res.json({ page });
  });

  return router;
}

module.exports = createAboutRoutes;
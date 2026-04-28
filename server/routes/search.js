const express = require('express');

function createSearchRoutes({ query, requireAuth, wantsJson, respondError, setFlash }) {
  const router = express.Router();

  async function searchAll(term) {
    const keyword = `%${term}%`;

    const [posts, resources, exams, homeworks, sections] = await Promise.all([
      query.all(`
        SELECT posts.id, posts.title, posts.post_type, boards.name AS board_name
        FROM posts
        JOIN boards ON boards.id = posts.board_id
        WHERE posts.title LIKE ? OR posts.content LIKE ?
        ORDER BY datetime(posts.updated_at) DESC
        LIMIT 8
      `, [keyword, keyword]),
      query.all(`
        SELECT resources.id, resources.title, boards.name AS board_name, resources.status
        FROM resources
        JOIN boards ON boards.id = resources.board_id
        WHERE resources.status = 'approved'
          AND (resources.title LIKE ? OR resources.description LIKE ? OR resources.teacher LIKE ?)
        ORDER BY datetime(resources.created_at) DESC
        LIMIT 8
      `, [keyword, keyword, keyword]),
      query.all(`
        SELECT exams.id, exams.title, exams.exam_type, exams.exam_date, boards.name AS board_name
        FROM exams
        JOIN boards ON boards.id = exams.board_id
        WHERE exams.title LIKE ? OR exams.description LIKE ? OR exams.teacher LIKE ?
        ORDER BY datetime(exams.exam_date) ASC
        LIMIT 8
      `, [keyword, keyword, keyword]),
      query.all(`
        SELECT homeworks.id, homeworks.title, homeworks.deadline, boards.name AS board_name
        FROM homeworks
        JOIN boards ON boards.id = homeworks.board_id
        WHERE homeworks.title LIKE ? OR homeworks.content LIKE ? OR homeworks.teacher LIKE ?
        ORDER BY datetime(homeworks.deadline) ASC
        LIMIT 8
      `, [keyword, keyword, keyword]),
      query.all(`
        SELECT boards.slug, boards.name, board_sections.section, board_sections.title
        FROM board_sections
        JOIN boards ON boards.id = board_sections.board_id
        WHERE board_sections.title LIKE ? OR board_sections.content LIKE ?
        ORDER BY boards.sort_order ASC
        LIMIT 8
      `, [keyword, keyword])
    ]);

    return {
      posts,
      resources,
      exams,
      homeworks,
      sections
    };
  }

  router.get('/search', async (req, res) => {
    const term = String(req.query.q || '').trim();

    res.render('search', {
      pageTitle: '搜索结果',
      term,
      results: term ? await searchAll(term) : null
    });
  });

  router.get('/api/search', async (req, res) => {
    const term = String(req.query.q || '').trim();
    res.json({
      term,
      results: term ? await searchAll(term) : { posts: [], resources: [], exams: [], homeworks: [], sections: [] }
    });
  });

  router.get('/api/search/history', requireAuth, async (req, res) => {
    const history = await query.all(`
      SELECT * FROM search_history WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT 10
    `, [req.user.id]);
    res.json({ history });
  });

  router.delete('/api/search/history/:id', requireAuth, async (req, res) => {
    await query.run('DELETE FROM search_history WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ ok: true });
  });

  router.get('/api/search/trending', async (req, res) => {
    const trending = await query.all(`
      SELECT * FROM trending_searches ORDER BY search_count DESC LIMIT 10
    `);
    res.json({ trending });
  });

  return router;
}

module.exports = createSearchRoutes;

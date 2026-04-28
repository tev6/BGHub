const express = require('express');

function createBoardsRoutes({ query, requireAuth, requireLevel, getBoards, getBoardBySlug, getBoardDetail, sectionTitles, sectionTitlesEn, respondError, setFlash, isStaff, needsAIAudit, applyContentCredit, auditContent, wantsJson, getUserLevel }) {
  const router = express.Router();

  router.get('/', requireAuth, requireLevel(4), async (req, res) => {
    const boards = await getBoards();
    res.render('boards', {
      pageTitle: 'CJ 管理',
      currentPath: '/boards',
      boards,
      user: req.user
    });
  });

  router.get('/:slug/edit', requireAuth, requireLevel(4), async (req, res) => {
    const detail = await getBoardDetail(req.params.slug, req.user);

    if (!detail) {
      respondError(req, res, 404, '学科板块不存在');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const section = req.query.section || 'IC';
    const dateStr = req.query.date || today;

    const sectionData = await query.get(`
      SELECT * FROM board_sections
      WHERE board_id = ? AND section = ? AND section_date = ?
    `, [detail.board.id, section, dateStr]);

    res.render('board-edit', {
      pageTitle: `${detail.board.name} - CJ 编辑`,
      detail,
      sectionTitles,
      sectionTitlesEn,
      currentDate: dateStr,
      currentSection: section,
      currentContent: sectionData ? sectionData.content : '',
      currentTitle: sectionData ? sectionData.title : ''
    });
  });

  router.get('/:slug', async (req, res) => {
    const dateStr = req.query.date || null;
    const detail = await getBoardDetail(req.params.slug, req.user, dateStr);

    if (!detail) {
      respondError(req, res, 404, '学科板块不存在');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    let selectedDateObj = null;
    if (dateStr) {
      selectedDateObj = new Date(dateStr);
      selectedDateObj.setHours(0, 0, 0, 0);
    } else {
      selectedDateObj = new Date(today);
    }

    const diffDays = Math.round((today - selectedDateObj) / (1000 * 60 * 60 * 24));

    let display = '今天';
    if (diffDays === 1) display = '昨天';
    else if (diffDays === 2) display = '前天';
    else if (diffDays > 2) display = dateStr;
    else if (diffDays < 0) display = dateStr;

    const prevDateObj = new Date(selectedDateObj);
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDate = prevDateObj.toISOString().split('T')[0];

    const nextDateObj = new Date(selectedDateObj);
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const nextDate = nextDateObj.toISOString().split('T')[0];

    const isToday = !dateStr || dateStr === todayStr;
    const isFuture = selectedDateObj.getTime() >= today.getTime();

    res.render('board', {
      pageTitle: `${detail.board.name} CJ`,
      detail,
      sectionTitles,
      sectionTitlesEn,
      dateNavData: {
        display,
        prevDate,
        nextDate,
        isToday: isToday && !dateStr,
        isFuture: isFuture
      }
    });
  });

  router.get('/:slug/cj', async (req, res) => {
    const dateStr = req.query.date || null;
    const detail = await getBoardDetail(req.params.slug, req.user, dateStr);

    if (!detail) {
      res.status(404).json({ error: '学科板块不存在' });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    let selectedDateObj = null;
    if (dateStr) {
      selectedDateObj = new Date(dateStr);
      selectedDateObj.setHours(0, 0, 0, 0);
    } else {
      selectedDateObj = new Date(today);
    }

    const prevDateObj = new Date(selectedDateObj);
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDate = prevDateObj.toISOString().split('T')[0];

    const nextDateObj = new Date(selectedDateObj);
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const nextDate = nextDateObj.toISOString().split('T')[0];

    const isFuture = selectedDateObj.getTime() >= today.getTime();

    res.json({
      sections: detail.sections,
      dateNav: {
        prevDate,
        nextDate,
        isFuture
      }
    });
  });

  router.post('/:slug/sections', requireAuth, async (req, res) => {
    const detail = await getBoardDetail(req.params.slug, req.user);

    if (!detail) {
      respondError(req, res, 404, '学科板块不存在');
      return;
    }

    if (!isStaff(req.user)) {
      respondError(req, res, 403, '当前仅管理员或审核员可维护 CJ 结构化内容');
      return;
    }

    const section = String(req.body.section || '').trim();
    const title = String(req.body.title || sectionTitles[section] || '').trim();
    const content = String(req.body.content || '').trim();
    const sectionDate = String(req.body.date || '').trim();
    const isToday = !sectionDate;

    if (!sectionTitles[section]) {
      respondError(req, res, 400, 'CJ 分区不合法');
      return;
    }

    if (needsAIAudit(req.user.role_level, 'cj')) {
      const auditResult = await auditContent(content, '', 'cj');
      if (!auditResult.passed) {
        respondError(req, res, 403, `内容违规：${auditResult.reason}`);
        return;
      }
      await applyContentCredit(req.user.id, 'cj', true);
    }

    const existing = await query.get(`
      SELECT id FROM board_sections
      WHERE board_id = ? AND section = ?
    `, [detail.board.id, section]);

    const effectiveDate = isToday ? "date('now', 'localtime')" : sectionDate;

    if (existing) {
      await query.run(`
        UPDATE board_sections
        SET section_date = ?, title = ?, content = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [effectiveDate, title || sectionTitles[section], content, req.user.id, existing.id]);
    } else {
      await query.run(`
        INSERT INTO board_sections (board_id, section, section_date, title, content, updated_by, updated_at)
        VALUES (?, ?, ${isToday ? "date('now', 'localtime')" : '?'}, ?, ?, ?, CURRENT_TIMESTAMP)
      `, isToday ? [detail.board.id, section, title || sectionTitles[section], content, req.user.id] : [detail.board.id, section, sectionDate, title || sectionTitles[section], content, req.user.id]);
    }

    setFlash(req, 'success', `${sectionTitles[section]} 已更新`);
    res.redirect(`/boards/${req.params.slug}`);
  });

  return router;
}

module.exports = createBoardsRoutes;
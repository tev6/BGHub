const express = require('express');

function createCJRoutes({ query, requireAuth, requireLevel, getBoards, getBoardBySlug, sectionTitles, sectionTitlesEn, respondError, setFlash, isStaff, needsAIAudit, applyContentCredit, auditContent, wantsJson, getUserLevel }) {
  const router = express.Router();

  async function getSectionsForBoard(boardId, dateStr, gradeContext, showAllClasses = false, viewingClass = null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const targetDate = dateStr || todayStr;

    const isG6G8 = gradeContext && ['G6', 'G7', 'G8'].includes(gradeContext.grade);
    const userClass = viewingClass || (gradeContext ? gradeContext.class_name : null);

    const perm = await query.get(
      'SELECT * FROM subject_grade_permissions WHERE board_id = ? AND grade = ?',
      [boardId, gradeContext ? gradeContext.grade : null]
    );

    let sections;
    if (!perm && gradeContext) {
      return [];
    }

    if (isG6G8 && perm && !perm.is_shared) {
      if (showAllClasses) {
        sections = await query.all(`
          SELECT * FROM board_sections
          WHERE board_id = ? AND section_date = ?
          ORDER BY class_name, section
        `, [boardId, targetDate]);
      } else {
        sections = await query.all(`
          SELECT * FROM board_sections
          WHERE board_id = ? AND section_date = ? AND (class_name = ? OR class_name IS NULL)
          ORDER BY section
        `, [boardId, targetDate, userClass]);
      }
    } else {
      sections = await query.all(`
        SELECT * FROM board_sections
        WHERE board_id = ? AND section_date = ?
        ORDER BY section
      `, [boardId, targetDate]);
    }

    return sections;
  }

  router.get('/', async (req, res) => {
    const gradeContext = req.gradeContext;
    const showAllClasses = req.query.showAllClasses === 'true';
    const boards = await getBoards(null, gradeContext, showAllClasses);
    const dateStr = req.query.date || null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    let selectedDateObj = dateStr ? new Date(dateStr) : new Date(today);
    selectedDateObj.setHours(0, 0, 0, 0);

    const prevDateObj = new Date(selectedDateObj);
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDate = prevDateObj.toISOString().split('T')[0];

    const nextDateObj = new Date(selectedDateObj);
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const nextDate = nextDateObj.toISOString().split('T')[0];

    const isToday = !dateStr || dateStr === todayStr;
    const isFuture = selectedDateObj.getTime() > today.getTime();

    const boardsWithCJ = await Promise.all(boards.map(async (board) => {
      const sections = await getSectionsForBoard(board.id, dateStr, gradeContext, showAllClasses);

      const sectionMap = {};
      sections.forEach(s => { sectionMap[s.section] = s; });

      return { ...board, sections: sectionMap };
    }));

    let display = '今天';
    if (dateStr) {
      const diffDays = Math.round((today.getTime() - selectedDateObj.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) display = '昨天';
      else if (diffDays === 2) display = '前天';
      else if (diffDays > 2 || diffDays < 0) display = dateStr;
    }

    res.render('cj/index', {
      pageTitle: 'CJ 内容',
      currentPath: '/cj',
      boards: boardsWithCJ,
      sectionTitles,
      sectionTitlesEn,
      currentDate: dateStr,
      dateDisplay: display,
      prevDate,
      nextDate,
      isFuture,
      isToday,
      user: req.user,
      gradeContext
    });
  });

  router.get('/subject', async (req, res) => {
    const subjectSlug = req.query.subject;
    if (!subjectSlug) {
      res.redirect('/cj');
      return;
    }

    const board = await getBoardBySlug(subjectSlug);
    if (!board) {
      respondError(req, res, 404, '学科不存在');
      return;
    }

    const dateStr = req.query.date || null;
    const gradeContext = req.gradeContext;
    const showAllClasses = req.query.showAllClasses === 'true';
    const viewingClass = req.query.class || null;

    const sections = await getSectionsForBoard(board.id, dateStr, gradeContext, showAllClasses, viewingClass);

    const sectionMap = {};
    sections.forEach(s => { sectionMap[s.section] = s; });

    const allBoards = await getBoards(null, gradeContext, showAllClasses);

    let display = '今天';
    if (dateStr) {
      const selectedDateObj = new Date(dateStr);
      selectedDateObj.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today - selectedDateObj) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) display = '今天';
      else if (diffDays === 1) display = '昨天';
      else if (diffDays === 2) display = '前天';
      else display = dateStr;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStrISO = today.toISOString().split('T')[0];
    const isToday = !dateStr || dateStr === todayStrISO;

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const canGoPrev = dateStr && dateStr > sevenDaysAgoStr && !isToday;

    const isG6G8 = gradeContext && ['G6', 'G7', 'G8'].includes(gradeContext.grade);
    const perm = await query.get(
      'SELECT is_shared FROM subject_grade_permissions WHERE board_id = ? AND grade = ?',
      [board.id, gradeContext ? gradeContext.grade : null]
    );
    const isShared = perm ? perm.is_shared : true;

    let displayName = board.name;
    let displayNameEn = board.name_en || board.name;
    if (isG6G8 && !isShared && (viewingClass || gradeContext.class_name)) {
      const classSuffix = `(${viewingClass || gradeContext.class_name})`;
      displayName = `${board.name}${classSuffix}`;
      displayNameEn = `${board.name_en || board.name}${classSuffix}`;
    }

    res.render('cj/subject', {
      pageTitle: `${displayName} CJ`,
      currentPath: '/cj',
      board,
      boards: allBoards,
      sections: sectionMap,
      sectionTitles,
      sectionTitlesEn,
      currentDate: dateStr,
      dateDisplay: display,
      isToday,
      canGoPrev,
      isStaff: isStaff(req.user),
      user: req.user,
      gradeContext,
      viewingClass,
      displayName,
      displayNameEn,
      isShared
    });
  });

  router.get('/edit', requireAuth, requireLevel(1), async (req, res) => {
    const subjectSlug = req.query.subject;
    const dateStr = req.query.date || null;

    if (!subjectSlug) {
      const boards = await getBoards();
      res.render('cj/select', {
        pageTitle: '选择学科编辑',
        currentPath: '/cj/edit',
        boards,
        sectionTitles,
        sectionTitlesEn,
        currentDate: dateStr,
        user: req.user
      });
      return;
    }

    const board = await getBoardBySlug(subjectSlug);
    if (!board) {
      respondError(req, res, 404, '学科不存在');
      return;
    }

    const gradeContext = req.gradeContext;
    const todayStr = new Date().toISOString().split('T')[0];
    const targetDate = dateStr || todayStr;

    const isG6G8 = gradeContext && ['G6', 'G7', 'G8'].includes(gradeContext.grade);
    let boardPermissions = [];
    if (isG6G8) {
      boardPermissions = await query.all(
        'SELECT board_id, is_shared FROM subject_grade_permissions WHERE grade = ?',
        [gradeContext.grade]
      );
    }

    let sections;
    if (isG6G8) {
      const perm = boardPermissions.find(p => p.board_id === board.id);
      if (perm && !perm.is_shared) {
        sections = await query.all(`
          SELECT * FROM board_sections
          WHERE board_id = ? AND section_date = ? AND (class_name = ? OR class_name IS NULL)
          ORDER BY section
        `, [board.id, targetDate, gradeContext.class_name]);
      } else {
        sections = await query.all(`
          SELECT * FROM board_sections
          WHERE board_id = ? AND section_date = ?
          ORDER BY section
        `, [board.id, targetDate]);
      }
    } else {
      sections = await query.all(`
        SELECT * FROM board_sections
        WHERE board_id = ? AND section_date = ?
        ORDER BY section
      `, [board.id, targetDate]);
    }

    const sectionMap = {};
    sections.forEach(s => { sectionMap[s.section] = s; });

    res.render('cj/edit', {
      pageTitle: `编辑 ${board.name} CJ`,
      currentPath: '/cj/edit',
      board,
      sections: sectionMap,
      sectionTitles,
      sectionTitlesEn,
      currentDate: targetDate,
      user: req.user,
      gradeContext,
      boardPermissions
    });
  });

  router.post('/edit', requireAuth, requireLevel(1), async (req, res) => {
    const subjectSlug = String(req.body.subject || '').trim();
    let dateStr = String(req.body.date || '').trim();
    const isToday = !dateStr;

    if (dateStr.includes(',')) {
      dateStr = dateStr.split(',')[0];
    }

    if (!subjectSlug) {
      respondError(req, res, 400, '请选择学科');
      return;
    }

    const board = await getBoardBySlug(subjectSlug);
    if (!board) {
      respondError(req, res, 404, '学科不存在');
      return;
    }

    const userGrade = req.user.grade;
    const userClass = req.user.class_name;
    const isG6G8 = ['G6', 'G7', 'G8'].includes(userGrade);

    const perm = await query.get(
      'SELECT * FROM subject_grade_permissions WHERE board_id = ? AND grade = ?',
      [board.id, userGrade]
    );

    let classNameToUse = null;
    if (isG6G8 && perm && !perm.is_shared && userClass) {
      classNameToUse = userClass;
    }

    const icContent = String(req.body.content_ic || '').trim();
    const hwContent = String(req.body.content_hw || '').trim();
    const aContent = String(req.body.content_a || '').trim();

    const targetDate = isToday ? todayStr() : dateStr;

    if (needsAIAudit(req.user.role_level, 'cj')) {
      const allContent = [icContent, hwContent, aContent].filter(c => c).join('\n');
      if (allContent) {
        const auditResult = await auditContent(allContent, '', 'cj');
        if (!auditResult.passed) {
          respondError(req, res, 403, `内容违规：${auditResult.reason}`);
          return;
        }
      }
      await applyContentCredit(req.user.id, 'cj', true);
    }

    await query.run(`
      INSERT INTO board_sections (board_id, section, section_date, title, content, class_name, updated_by, updated_at)
      VALUES (?, 'IC', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(board_id, section, section_date, class_name) DO UPDATE SET
        section_date = excluded.section_date,
        title = excluded.title,
        content = excluded.content,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `, [board.id, targetDate, sectionTitles['IC'] || 'IC', icContent, classNameToUse, req.user.id]);

    await query.run(`
      INSERT INTO board_sections (board_id, section, section_date, title, content, class_name, updated_by, updated_at)
      VALUES (?, 'HW', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(board_id, section, section_date, class_name) DO UPDATE SET
        section_date = excluded.section_date,
        title = excluded.title,
        content = excluded.content,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `, [board.id, targetDate, sectionTitles['HW'] || 'HW', hwContent, classNameToUse, req.user.id]);

    await query.run(`
      INSERT INTO board_sections (board_id, section, section_date, title, content, class_name, updated_by, updated_at)
      VALUES (?, 'A', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(board_id, section, section_date, class_name) DO UPDATE SET
        section_date = excluded.section_date,
        title = excluded.title,
        content = excluded.content,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `, [board.id, targetDate, sectionTitles['A'] || 'A', aContent, classNameToUse, req.user.id]);

    setFlash(req, 'success', 'CJ 内容已更新');
    res.redirect(`/cj/subject?subject=${subjectSlug}`);
  });

  router.get('/api', async (req, res) => {
    const subjectSlug = req.query.subject;
    const dateStr = req.query.date || null;

    if (!subjectSlug) {
      res.status(400).json({ error: '缺少 subject 参数' });
      return;
    }

    const board = await getBoardBySlug(subjectSlug);
    if (!board) {
      res.status(404).json({ error: '学科不存在' });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const targetDate = dateStr || todayStr;

    const sections = await query.all(`
      SELECT * FROM board_sections
      WHERE board_id = ? AND section_date = ?
      ORDER BY section
    `, [board.id, targetDate]);

    const sectionMap = {};
    sections.forEach(s => { sectionMap[s.section] = s; });

    const gradeContext = req.gradeContext;
    const allBoards = await getBoards(null, gradeContext);

    res.json({
      board,
      boards: allBoards,
      sections: sectionMap,
      currentDate: targetDate
    });
  });

  return router;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

module.exports = createCJRoutes;
const express = require('express');
const { todayStr } = require('../utils/date');

function createCJRoutes({ query, requireAuth, requireLevel, getBoards, getBoardBySlug, sectionTitles, sectionTitlesEn, respondError, setFlash, isStaff, needsAIAudit, applyContentCredit, auditContent, wantsJson, getUserLevel }) {
  const router = express.Router();

  async function getSectionsForBoard(boardId, dateStr, gradeContext, showAllClasses = false, viewingClass = null) {
    const targetDate = dateStr || todayStr();

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
          SELECT bs.*, u.name as updated_by_name
          FROM board_sections bs
          LEFT JOIN users u ON u.id = bs.updated_by
          WHERE bs.board_id = ? AND bs.section_date = ?
          ORDER BY bs.class_name, bs.section
        `, [boardId, targetDate]);
      } else {
        sections = await query.all(`
          SELECT bs.*, u.name as updated_by_name
          FROM board_sections bs
          LEFT JOIN users u ON u.id = bs.updated_by
          WHERE bs.board_id = ? AND bs.section_date = ? AND (bs.class_name = ? OR bs.class_name IS NULL)
          ORDER BY bs.section
        `, [boardId, targetDate, userClass]);
      }
    } else {
      sections = await query.all(`
        SELECT bs.*, u.name as updated_by_name
        FROM board_sections bs
        LEFT JOIN users u ON u.id = bs.updated_by
        WHERE bs.board_id = ? AND bs.section_date = ?
        ORDER BY bs.section
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

    const urlGrade = req.query.grade;
    const urlClass = req.query.class || null;
    const effectiveGradeContext = (urlGrade)
      ? { grade: urlGrade, class_name: urlClass }
      : req.gradeContext;

    const showAllClasses = req.query.showAllClasses === 'true';
    const viewingClass = urlClass;

    const sections = await getSectionsForBoard(board.id, dateStr, effectiveGradeContext, showAllClasses, viewingClass);

    const sectionMap = {};
    sections.forEach(s => { sectionMap[s.section] = s; });

    const allBoards = await getBoards(null, effectiveGradeContext, showAllClasses);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const locale = res.locals.locale || 'zh';
    let display = locale === 'en' ? 'Today' : '今天';
    if (dateStr) {
      const selectedDateObj = new Date(dateStr);
      selectedDateObj.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today - selectedDateObj) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) display = locale === 'en' ? 'Today' : '今天';
      else if (diffDays === 1) display = locale === 'en' ? 'Yesterday' : '昨天';
      else if (diffDays === 2) display = locale === 'en' ? 'The day before yesterday' : '前天';
      else display = dateStr;
    }

    const todayStrVal = todayStr();
    const isToday = !dateStr || dateStr === todayStrVal;

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const canGoPrev = dateStr && dateStr > sevenDaysAgoStr && !isToday;

    const isG6G8 = effectiveGradeContext && ['G6', 'G7', 'G8'].includes(effectiveGradeContext.grade);
    const perm = await query.get(
      'SELECT is_shared FROM subject_grade_permissions WHERE board_id = ? AND grade = ?',
      [board.id, effectiveGradeContext ? effectiveGradeContext.grade : null]
    );
    const isShared = perm ? perm.is_shared : true;

    let displayName = board.name;
    let displayNameEn = board.name_en || board.name;
    if (isG6G8 && !isShared && (viewingClass || effectiveGradeContext.class_name)) {
      const classSuffix = `(${viewingClass || effectiveGradeContext.class_name})`;
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
      gradeContext: effectiveGradeContext,
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

    async function upsertSection(sectionKey, content, sectionTitle) {
      const existing = await query.get(`
        SELECT * FROM board_sections
        WHERE board_id = ? AND section = ? AND section_date = ? AND (class_name = ? OR (class_name IS NULL AND ? IS NULL))
      `, [board.id, sectionKey, targetDate, classNameToUse, classNameToUse]);

      const oldContent = existing ? existing.content : '';

      await query.run(`
        INSERT INTO board_sections (board_id, section, section_date, title, content, class_name, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(board_id, section, section_date, class_name) DO UPDATE SET
          section_date = excluded.section_date,
          title = excluded.title,
          content = excluded.content,
          updated_by = excluded.updated_by,
          updated_at = CURRENT_TIMESTAMP
      `, [board.id, sectionKey, targetDate, sectionTitle, content, classNameToUse, req.user.id]);

      if (oldContent !== content) {
        await query.run(`
          INSERT INTO board_section_revisions (board_id, section_key, section_date, class_name, old_content, new_content, changed_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [board.id, sectionKey, targetDate, classNameToUse, oldContent, content, req.user.id]);
      }
    }

    await upsertSection('IC', icContent, sectionTitles['IC'] || 'IC');
    await upsertSection('HW', hwContent, sectionTitles['HW'] || 'HW');
    await upsertSection('A', aContent, sectionTitles['A'] || 'A');

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

  router.get('/quick', async (req, res) => {
    const queryGrade = req.query.grade;
    const queryClass = req.query.class;

    let effectiveGrade = queryGrade;
    let effectiveClass = queryClass;

    if (!effectiveGrade && req.user) {
      effectiveGrade = req.user.grade;
      effectiveClass = req.user.class_name;
    }

    if (!effectiveGrade) {
      res.redirect('/cj');
      return;
    }

    if (!['G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12'].includes(effectiveGrade)) {
      res.redirect('/cj');
      return;
    }

    const effectiveGradeContext = {
      grade: effectiveGrade,
      class_name: effectiveClass
    };

    const permBoards = await query.all(
      'SELECT board_id FROM subject_grade_permissions WHERE grade = ?',
      [effectiveGrade]
    );
    const permittedBoardIds = new Set(permBoards.map(b => b.board_id));

    let boards = await getBoards(null, effectiveGradeContext);
    boards = boards.filter(board => permittedBoardIds.has(board.id));

    const isG6G8 = ['G6', 'G7', 'G8'].includes(effectiveGrade);

    const currentDate = todayStr();

    const boardsWithSections = await Promise.all(boards.map(async (board) => {
      let sections;
      if (isG6G8 && effectiveClass) {
        sections = await query.all(`
          SELECT bs.*, u.name as updated_by_name
          FROM board_sections bs
          LEFT JOIN users u ON u.id = bs.updated_by
          WHERE bs.board_id = ? AND bs.section_date = ? AND (bs.class_name = ? OR bs.class_name IS NULL)
          ORDER BY bs.section
        `, [board.id, currentDate, effectiveClass]);
      } else {
        sections = await query.all(`
          SELECT bs.*, u.name as updated_by_name
          FROM board_sections bs
          LEFT JOIN users u ON u.id = bs.updated_by
          WHERE bs.board_id = ? AND bs.section_date = ?
          ORDER BY bs.section
        `, [board.id, currentDate]);
      }

      const sectionMap = {};
      sections.forEach(s => { sectionMap[s.section] = s; });
      return { ...board, sections: sectionMap };
    }));

    const availableClasses = isG6G8 ? await query.all(
      'SELECT DISTINCT class_name FROM grade_classes WHERE grade = ? ORDER BY sort_order, class_name',
      [effectiveGrade]
    ) : [];

    const host = req.headers.host || 'bghub.com';
    const shareUrl = `https://${host}/cj/quick?grade=${effectiveGrade}${effectiveClass ? '&class=' + effectiveClass : ''}`;

    res.render('cj/quick', {
      pageTitle: `CJ 快捷访问 - ${effectiveGrade}${effectiveClass ? ' ' + effectiveClass : ''}`,
      currentPath: '/cj/quick',
      boards: boardsWithSections,
      sectionTitles,
      sectionTitlesEn,
      currentGrade: effectiveGrade,
      currentClass: effectiveClass,
      isG6G8,
      availableClasses: availableClasses.map(c => c.class_name),
      user: req.user,
      shareUrl
    });
  });

  router.post('/api/report', requireAuth, async (req, res) => {
    if (!req.user || req.user.role_level < 1) {
      res.status(403).json({ error: 'LV1及以上用户才能举报' });
      return;
    }

    const { boardId, sectionKey, sectionDate, className, reason } = req.body;

    if (!boardId || !sectionKey || !sectionDate || !reason) {
      res.status(400).json({ error: '缺少必要参数' });
      return;
    }

    const section = await query.get(`
      SELECT bs.*, u.name as updater_name, u.id as updater_id
      FROM board_sections bs
      LEFT JOIN users u ON u.id = bs.updated_by
      WHERE bs.board_id = ? AND bs.section = ? AND bs.section_date = ? AND (bs.class_name = ? OR (bs.class_name IS NULL AND ? IS NULL))
    `, [boardId, sectionKey, sectionDate, className, className]);

    if (!section) {
      res.status(404).json({ error: '内容不存在' });
      return;
    }

    const targetUserId = section.updated_by;

    if (targetUserId === req.user.id) {
      res.status(400).json({ error: '不能举报自己的内容' });
      return;
    }

    try {
      const { submitReport, TARGET_TYPES } = require('../services/reportService');
      const targetType = TARGET_TYPES.CJ;
      const targetId = `${boardId}-${sectionKey}-${sectionDate}-${className || 'all'}`;

      await submitReport(req.user.id, targetType, targetId, reason, targetUserId);

      res.json({ ok: true, message: '举报已提交' });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/api/revisions', async (req, res) => {
    const { boardId, sectionDate, className } = req.query;

    if (!boardId || !sectionDate) {
      res.status(400).json({ error: '缺少必要参数' });
      return;
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const revisions = await query.all(`
      SELECT r.*, u.name as changer_name
      FROM board_section_revisions r
      JOIN users u ON u.id = r.changed_by
      WHERE r.board_id = ? AND r.section_date = ? AND r.changed_at > ?
      ORDER BY r.changed_at DESC
      LIMIT 50
    `, [boardId, sectionDate, sevenDaysAgo]);

    res.json({ revisions });
  });

  return router;
}

module.exports = createCJRoutes;
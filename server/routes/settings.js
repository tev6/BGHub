const path = require('path');
const fs = require('fs');

function createSettingsRoutes({ query, requireAuth, bcrypt }) {
  const pageRouter = require('express').Router();
  const apiRouter = require('express').Router();

  pageRouter.get('/settings', requireAuth, async (req, res) => {
    const user = await query.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const credit = await query.get('SELECT * FROM user_credit WHERE user_id = ?', [req.user.id]);
    const creditHistory = await query.all(`
      SELECT cl.*, u.name AS reviewer_name
      FROM credit_log cl
      LEFT JOIN users u ON u.id = cl.reviewer_id
      WHERE cl.user_id = ?
      ORDER BY datetime(cl.created_at) DESC
      LIMIT 50
    `, [req.user.id]);
    const roleInfo = await query.get('SELECT * FROM roles WHERE level = ?', [user.role_level]);
    const nextLevel = await query.get(`
      SELECT * FROM roles WHERE min_credit > ? AND level NOT IN (55, 6) ORDER BY min_credit ASC LIMIT 1
    `, [credit ? credit.credit : 0]);
    const allRoles = await query.all(`
      SELECT * FROM roles WHERE level NOT IN (55, 6) ORDER BY level ASC
    `);

    const today = new Date().toISOString().split('T')[0];
    const level = user.role_level;

    let reportLimit = 0;
    if (level >= 5) reportLimit = 20;
    else if (level >= 3) reportLimit = 10;
    else if (level >= 1) reportLimit = 5;

    let appealLimit = 0;
    if (level >= 5) appealLimit = -1;
    else if (level >= 4) appealLimit = 5;
    else if (level >= 3) appealLimit = 3;

    const todayReports = await query.get(`
      SELECT COUNT(*) AS count FROM reports
      WHERE reporter_id = ? AND date(created_at) = ?
    `, [req.user.id, today]);

    const todayAppeals = await query.get(`
      SELECT COUNT(*) AS count FROM review_appeals
      WHERE user_id = ? AND date(created_at) = ?
    `, [req.user.id, today]);

    const reportUsed = todayReports ? todayReports.count : 0;
    const appealUsed = todayAppeals ? todayAppeals.count : 0;
    const reportRemaining = reportLimit > 0 ? Math.max(0, reportLimit - reportUsed) : 0;
    const appealRemaining = appealLimit === -1 ? -1 : Math.max(0, appealLimit - appealUsed);

    const locale = res.locals.locale || 'zh';
    let usageGuideContent = '';
    try {
      const guidePath = path.join(process.cwd(), 'docs', `usage-guide.${locale}.md`);
      usageGuideContent = fs.readFileSync(guidePath, 'utf8');
    } catch (e) {
      try {
        const fallback = path.join(process.cwd(), 'docs', 'usage-guide.zh.md');
        usageGuideContent = fs.readFileSync(fallback, 'utf8');
      } catch (e2) {
        usageGuideContent = '';
      }
    }

    res.render('settings', {
      pageTitle: 'settings.title',
      currentPath: '/settings',
      user: {
        ...user,
        role_name: roleInfo ? roleInfo.name : 'LV' + user.role_level,
        credit: credit ? credit.credit : 0
      },
      credit,
      creditHistory,
      roleInfo,
      nextLevel,
      allRoles,
      reportLimit,
      reportUsed,
      reportRemaining,
      appealLimit,
      appealUsed,
      appealRemaining,
      usageGuideContent
    });
  });

  apiRouter.post('/settings/grade', requireAuth, async (req, res) => {
    const { grade, password } = req.body;
    const user = await query.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);

    if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
      res.status(403).json({ error: '密码验证失败' });
      return;
    }

    if (!/^G(6|7|8|9|10|11|12)$/.test(grade)) {
      res.status(400).json({ error: '无效的年级' });
      return;
    }

    await query.run('UPDATE users SET grade = ? WHERE id = ?', [grade, req.user.id]);
    res.json({ ok: true });
  });

  apiRouter.post('/settings/class', requireAuth, async (req, res) => {
    const { class_name, password } = req.body;
    const user = await query.get('SELECT password_hash, grade FROM users WHERE id = ?', [req.user.id]);

    if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
      res.status(403).json({ error: '密码验证失败' });
      return;
    }

    if (!['G6', 'G7', 'G8'].includes(user.grade)) {
      res.status(400).json({ error: '只有 G6-G8 年级需要班级' });
      return;
    }

    if (!class_name) {
      res.status(400).json({ error: '班级不能为空' });
      return;
    }

    const validClass = await query.get(
      'SELECT id FROM grade_classes WHERE grade = ? AND class_name = ?',
      [user.grade, class_name.toUpperCase()]
    );
    if (!validClass) {
      res.status(400).json({ error: '该班级不存在' });
      return;
    }

    await query.run('UPDATE users SET class_name = ? WHERE id = ?', [class_name.toUpperCase(), req.user.id]);
    res.json({ ok: true });
  });

  apiRouter.post('/settings/deactivate', requireAuth, async (req, res) => {
    const password = String(req.body.password || '');
    const user = await query.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(403).json({ error: '密码验证失败' });
      return;
    }

    await query.run('UPDATE users SET banned_until = datetime(CURRENT_TIMESTAMP, "+100 years") WHERE id = ?', [req.user.id]);
    req.session.destroy();
    res.json({ success: true });
  });

  apiRouter.post('/settings/locale', requireAuth, async (req, res) => {
    const locale = req.body.locale === 'en' ? 'en' : 'zh';
    await query.run('UPDATE users SET locale = ? WHERE id = ?', [locale, req.user.id]);
    res.json({ ok: true, locale });
  });

  return { pageRouter, apiRouter };
}

module.exports = createSettingsRoutes;

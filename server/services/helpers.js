function createHelpers({ query }) {
  function getUserLevel(user) {
    return Math.max(0, Number(user && user.role_level != null ? user.role_level : 0));
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  function canManagePost(user, post) {
    return Boolean(user && (user.id === post.user_id || getUserLevel(user) >= 3));
  }

  function canMarkBestAnswer(user, post) {
    return Boolean(user && (user.id === post.user_id || getUserLevel(user) >= 3));
  }

  function setFlash(req, type, message) {
    req.session.flash = { type, message };
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
      res.status(statusCode).render('login', {
        pageTitle: '系统错误',
        formMode: null,
        errors: [message]
      });
      return;
    }

    setFlash(req, 'error', message);
    res.redirect('back');
  }

  function parseDateValue(value) {
    return value ? new Date(value) : null;
  }

  async function runTransaction(callback) {
    await query.run('BEGIN IMMEDIATE TRANSACTION');
    try {
      const result = await callback();
      await query.run('COMMIT');
      return result;
    } catch (error) {
      await query.run('ROLLBACK');
      throw error;
    }
  }

  async function autoUnbanOnLogin(userId) {
    const banRecord = await query.get('SELECT * FROM user_bans WHERE user_id = ?', [userId]);

    if (banRecord && banRecord.expires_at) {
      if (parseDateValue(banRecord.expires_at) <= new Date()) {
        await query.run('DELETE FROM user_bans WHERE user_id = ?', [userId]);
        await query.run('UPDATE users SET banned_until = NULL WHERE id = ?', [userId]);
        return true;
      }
    }

    return false;
  }

  async function getSupercodeLock(email) {
    const record = await query.get('SELECT * FROM supercode_lockouts WHERE email = ?', [email]);
    if (!record) {
      return null;
    }
    if (record.locked_until && parseDateValue(record.locked_until) > new Date()) {
      return record;
    }
    return null;
  }

  async function clearSupercodeLock(email) {
    await query.run('DELETE FROM supercode_lockouts WHERE email = ?', [email]);
  }

  async function bumpSupercodeFailure(email) {
    const current = await query.get('SELECT * FROM supercode_lockouts WHERE email = ?', [email]);
    const nextCount = (current ? current.failed_count : 0) + 1;
    const lockedUntil = nextCount >= 5 ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
    await query.run(
      `INSERT INTO supercode_lockouts (email, failed_count, locked_until)
       VALUES (?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET failed_count = excluded.failed_count, locked_until = excluded.locked_until`,
      [email, nextCount, lockedUntil]
    );
  }

  async function createReviewItem(itemType, itemId, userId) {
    const result = await query.run(
      'INSERT INTO review_items (item_type, item_id, created_by) VALUES (?, ?, ?)',
      [itemType, itemId, userId]
    );
    return result.lastID;
  }

  async function countDailyActions(userId, tableName) {
    const row = await query.get(
      `SELECT COUNT(*) AS count FROM ${tableName} WHERE created_by = ? AND date(created_at) = date('now', 'localtime')`,
      [userId]
    );
    return row ? row.count : 0;
  }

  async function countDailyChatSubmissions(userId) {
    const row = await query.get(
      `SELECT COUNT(*) AS count FROM chat_messages WHERE user_id = ? AND date(created_at) = date('now', 'localtime')`,
      [userId]
    );
    return row ? row.count : 0;
  }

  async function getBoardById(boardId) {
    return query.get('SELECT * FROM boards WHERE id = ?', [boardId]);
  }

  async function getBoardBySlug(slug) {
    return query.get('SELECT * FROM boards WHERE slug = ?', [slug]);
  }

  async function getBoards(dateStr = null) {
    let sections;
    if (dateStr) {
      sections = await query.all(`
        SELECT board_sections.*, users.name AS updater_name
        FROM board_sections
        LEFT JOIN users ON users.id = board_sections.updated_by
        WHERE board_sections.section_date = ?
        ORDER BY board_sections.board_id, board_sections.section
      `, [dateStr]);
    } else {
      sections = await query.all(`
        SELECT board_sections.*, users.name AS updater_name
        FROM board_sections
        LEFT JOIN users ON users.id = board_sections.updated_by
        WHERE board_sections.section_date = date('now', 'localtime')
        ORDER BY board_sections.board_id, board_sections.section
      `);
    }

    const boards = await query.all('SELECT * FROM boards ORDER BY sort_order, name');
    const sectionMap = new Map();

    sections.forEach((section) => {
      if (!sectionMap.has(section.board_id)) {
        sectionMap.set(section.board_id, {});
      }

      sectionMap.get(section.board_id)[section.section] = section;
    });

    return boards.map((board) => ({
      ...board,
      sections: sectionMap.get(board.id) || {}
    }));
  }

  async function getDashboardData(user, dateStr = null) {
    const boards = await getBoards(dateStr);
    const statsRows = await Promise.all([
      query.get('SELECT COUNT(*) AS count FROM exams'),
      query.get('SELECT COUNT(*) AS count FROM homeworks'),
      query.get("SELECT COUNT(*) AS count FROM resources WHERE status = 'approved'"),
      query.get('SELECT COUNT(*) AS count FROM posts')
    ]);

    const upcomingExams = await query.all(`
      SELECT exams.*, boards.name AS board_name, boards.slug AS board_slug
      FROM exams
      JOIN boards ON boards.id = exams.board_id
      ORDER BY datetime(exam_date) ASC
      LIMIT 6
    `);

    const dueHomeworks = await query.all(`
      SELECT homeworks.*, boards.name AS board_name, boards.slug AS board_slug,
             CASE WHEN homework_statuses.is_completed = 1 THEN 1 ELSE 0 END AS is_completed
      FROM homeworks
      JOIN boards ON boards.id = homeworks.board_id
      LEFT JOIN homework_statuses
        ON homework_statuses.homework_id = homeworks.id
       AND homework_statuses.user_id = ?
      ORDER BY datetime(homeworks.deadline) ASC
      LIMIT 6
    `, [user ? user.id : -1]);

    const recentPosts = await query.all(`
      SELECT posts.*, boards.name AS board_name, boards.slug AS board_slug,
             users.name AS author_name,
             COUNT(comments.id) AS comment_count
      FROM posts
      JOIN boards ON boards.id = posts.board_id
      JOIN users ON users.id = posts.user_id
      LEFT JOIN comments ON comments.post_id = posts.id
      WHERE posts.review_status = 'approved'
      GROUP BY posts.id
      ORDER BY datetime(posts.created_at) DESC
      LIMIT 6
    `);

    const resources = await query.all(`
      SELECT resources.*, boards.name AS board_name, boards.slug AS board_slug
      FROM resources
      JOIN boards ON boards.id = resources.board_id
      WHERE resources.status = 'approved'
      ORDER BY datetime(resources.created_at) DESC
      LIMIT 6
    `);

    const chatMessages = await query.all(`
      SELECT chat_messages.*, 
             COALESCE(users.name, '游客' || COALESCE(chat_messages.guest_id, '')) AS author_name
      FROM chat_messages
      LEFT JOIN users ON users.id = chat_messages.user_id
      WHERE chat_messages.status IN ('approved', 'visible_pending') AND chat_messages.is_rejected = 0
      AND datetime(chat_messages.created_at) > datetime('now', '-24 hours')
      ORDER BY datetime(chat_messages.created_at) ASC
      LIMIT 8
    `);

    return {
      boards,
      stats: {
        exams: statsRows[0].count,
        homeworks: statsRows[1].count,
        resources: statsRows[2].count,
        posts: statsRows[3].count
      },
      upcomingExams,
      dueHomeworks,
      recentPosts,
      resources,
      chatMessages
    };
  }

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

    if (filters.type) {
      conditions.push('posts.post_type = ?');
      params.push(filters.type);
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
      JOIN boards ON boards.id = posts.board_id
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
      JOIN boards ON boards.id = posts.board_id
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

  async function getBoardDetail(slug, user, dateStr = null) {
    const board = await getBoardBySlug(slug);

    if (!board) {
      return null;
    }

    let sections;
    if (dateStr) {
      sections = await query.all(`
        SELECT board_sections.*, users.name AS updater_name
        FROM board_sections
        LEFT JOIN users ON users.id = board_sections.updated_by
        WHERE board_sections.board_id = ? AND board_sections.section_date = ?
        ORDER BY board_sections.section
      `, [board.id, dateStr]);
    } else {
      sections = await query.all(`
        SELECT board_sections.*, users.name AS updater_name
        FROM board_sections
        LEFT JOIN users ON users.id = board_sections.updated_by
        WHERE board_sections.board_id = ? AND board_sections.section_date = date('now', 'localtime')
        ORDER BY board_sections.section
      `, [board.id]);
    }

    const sectionMap = {};
    sections.forEach((section) => {
      sectionMap[section.section] = section;
    });

    const exams = await query.all(`
      SELECT * FROM exams
      WHERE board_id = ?
      ORDER BY datetime(exam_date) ASC
      LIMIT 8
    `, [board.id]);

    const homeworks = await query.all(`
      SELECT homeworks.*,
             CASE WHEN homework_statuses.is_completed = 1 THEN 1 ELSE 0 END AS is_completed
      FROM homeworks
      LEFT JOIN homework_statuses
        ON homework_statuses.homework_id = homeworks.id
       AND homework_statuses.user_id = ?
      WHERE homeworks.board_id = ?
      ORDER BY datetime(homeworks.deadline) ASC
      LIMIT 8
    `, [user ? user.id : -1, board.id]);

    const resources = await query.all(`
      SELECT resources.*, users.name AS uploader_name
      FROM resources
      LEFT JOIN users ON users.id = resources.uploaded_by
      WHERE resources.board_id = ?
        AND (resources.status = 'approved' OR resources.uploaded_by = ?)
      ORDER BY datetime(resources.created_at) DESC
      LIMIT 8
    `, [board.id, user ? user.id : -1]);

    const posts = await query.all(`
      SELECT posts.*, users.name AS author_name,
             COUNT(comments.id) AS comment_count
      FROM posts
      JOIN users ON users.id = posts.user_id
      LEFT JOIN comments ON comments.post_id = posts.id
      WHERE posts.board_id = ?
      GROUP BY posts.id
      ORDER BY datetime(posts.created_at) DESC
      LIMIT 8
    `, [board.id]);

    return {
      board,
      sections: sectionMap,
      exams,
      homeworks,
      resources,
      posts
    };
  }

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

  async function getUserProfile(userId) {
    return query.get(`
      SELECT users.id, users.email, users.name, users.grade, users.role, users.role_level, users.created_at,
             users.banned_until, users.muted_until,
             COALESCE(user_credit.credit, 0) AS credit,
             user_credit.last_login_date,
             roles.name AS role_name,
             roles.badge_color AS badge_color,
             roles.is_admin AS is_admin
      FROM users
      LEFT JOIN user_credit ON user_credit.user_id = users.id
      LEFT JOIN roles ON roles.level = users.role_level
      WHERE users.id = ?
    `, [userId]);
  }

  async function getDailyStats(userId) {
    const today = new Date().toISOString().slice(0, 10);
    let stats = await query.get(
      'SELECT * FROM daily_stats WHERE user_id = ? AND stat_date = ?',
      [userId, today]
    );

    if (!stats) {
      await query.run(
        `INSERT OR IGNORE INTO daily_stats (user_id, stat_date, posts_count, chat_count, cj_count, resource_count, login_credit_received, credit_capped)
         VALUES (?, ?, 0, 0, 0, 0, 0, 0)`,
        [userId, today]
      );
      stats = await query.get(
        'SELECT * FROM daily_stats WHERE user_id = ? AND stat_date = ?',
        [userId, today]
      );
    }

    return stats;
  }

  async function checkDailyLimit(user, type) {
    const userLevel = getUserLevel(user);
    const roleInfo = await query.get('SELECT daily_post_limit FROM roles WHERE level = ?', [userLevel]);

    if (!roleInfo || userLevel >= 6 || userLevel === 55) {
      return { allowed: true, limit: -1, current: 0 };
    }

    const stats = await getDailyStats(user.id);
    const fieldMap = {
      post: 'posts_count',
      chat: 'chat_count',
      cj: 'cj_count',
      resource: 'resource_count',
      report: 'reports_count',
      appeal: 'appeals_count'
    };

    const field = fieldMap[type];
    if (!field) {
      return { allowed: false, limit: 0, current: 0 };
    }

    const current = Number(stats[field]) || 0;
    const limit = Number(roleInfo.daily_post_limit) || 0;

    return {
      allowed: current < limit,
      limit,
      current
    };
  }

  async function getDailyReportAppealLimit(user, type) {
    const userLevel = getUserLevel(user);

    if (userLevel < 3) {
      return { allowed: false, limit: 0, current: 0, reason: 'LV0-2用户不可申诉' };
    }

    if (userLevel === 6 || userLevel === 55) {
      return { allowed: true, limit: -1, current: 0 };
    }

    let limit = 5;
    if (type === 'appeal') {
      if (userLevel === 3) limit = 3;
      else if (userLevel === 4) limit = 5;
      else if (userLevel >= 5) limit = -1;
    } else {
      if (userLevel >= 3 && userLevel <= 4) limit = 10;
      else if (userLevel >= 5) limit = 20;
    }

    const today = new Date().toISOString().slice(0, 10);
    const field = type === 'report' ? 'reports_count' : 'appeals_count';

    const stats = await query.get(
      'SELECT * FROM daily_stats WHERE user_id = ? AND stat_date = ?',
      [user.id, today]
    );

    const current = stats ? Number(stats[field]) || 0 : 0;

    if (limit === -1) {
      return { allowed: true, limit: -1, current };
    }

    return {
      allowed: current < limit,
      limit,
      current
    };
  }

  async function incrementDailyCount(userId, type) {
    const today = new Date().toISOString().slice(0, 10);
    const fieldMap = {
      post: 'posts_count',
      chat: 'chat_count',
      cj: 'cj_count',
      resource: 'resource_count',
      report: 'reports_count',
      appeal: 'appeals_count'
    };

    const field = fieldMap[type];
    if (!field) {
      return;
    }

    await query.run(
      `INSERT INTO daily_stats (user_id, stat_date, ${field})
       VALUES (?, ?, 1)
       ON CONFLICT(user_id, stat_date) DO UPDATE SET ${field} = ${field} + 1`,
      [userId, today]
    );
  }

  async function checkCreditCap(user) {
    const userLevel = getUserLevel(user);
    const creditCapInfo = await query.get('SELECT max_credit FROM roles WHERE level = ?', [userLevel]);
    const creditCap = creditCapInfo && creditCapInfo.max_credit >= 0 ? Number(creditCapInfo.max_credit) : -1;

    if (creditCap < 0) {
      return { capped: false, excess: 0 };
    }

    const creditRow = await query.get('SELECT * FROM user_credit WHERE user_id = ?', [user.id]);
    const currentCredit = Number(creditRow ? creditRow.credit : 0) || 0;

    if (currentCredit <= creditCap) {
      return { capped: false, excess: 0 };
    }

    const excessCredit = currentCredit - creditCap;

    const existingCap = await query.get('SELECT * FROM credit_caps WHERE user_id = ?', [user.id]);
    if (!existingCap) {
      await query.run(
        'INSERT INTO credit_caps (user_id, excess_credit, released_at) VALUES (?, ?, NULL)',
        [user.id, excessCredit]
      );
    } else {
      await query.run(
        'UPDATE credit_caps SET excess_credit = ? WHERE user_id = ?',
        [excessCredit, user.id]
      );
    }

    return { capped: true, excess: excessCredit };
  }

  async function checkIpBan(req) {
    const ip = req.headers['x-forwarded-for']
      ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
      : (req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '');

    if (!ip) {
      return null;
    }

    const banRecord = await query.get('SELECT * FROM ip_bans WHERE ip_address = ?', [ip]);

    if (banRecord) {
      if (banRecord.expires_at && parseDateValue(banRecord.expires_at) > new Date()) {
        const remainingMinutes = Math.ceil((parseDateValue(banRecord.expires_at) - new Date()) / 60000);
        return { reason: banRecord.reason, remainingMinutes };
      }

      await query.run('DELETE FROM ip_bans WHERE ip_address = ?', [ip]);
    }

    return null;
  }

  async function checkUserBan(userId) {
    const banRecord = await query.get('SELECT * FROM user_bans WHERE user_id = ?', [userId]);

    if (banRecord) {
      if (banRecord.expires_at && parseDateValue(banRecord.expires_at) > new Date()) {
        const remainingMinutes = Math.ceil((parseDateValue(banRecord.expires_at) - new Date()) / 60000);
        return { reason: banRecord.reason, remainingMinutes };
      }

      await query.run('DELETE FROM user_bans WHERE user_id = ?', [userId]);
    }

    return null;
  }

  return {
    getUserLevel,
    validateEmail,
    canManagePost,
    canMarkBestAnswer,
    setFlash,
    wantsJson,
    respondError,
    parseDateValue,
    runTransaction,
    autoUnbanOnLogin,
    getSupercodeLock,
    clearSupercodeLock,
    bumpSupercodeFailure,
    createReviewItem,
    countDailyActions,
    countDailyChatSubmissions,
    getBoardById,
    getBoardBySlug,
    getBoards,
    getDashboardData,
    getForumPosts,
    getPostDetail,
    getBoardDetail,
    searchAll,
    getUserProfile,
    getDailyStats,
    checkDailyLimit,
    incrementDailyCount,
    getDailyReportAppealLimit,
    checkCreditCap,
    checkIpBan,
    checkUserBan
  };
}

module.exports = { createHelpers };

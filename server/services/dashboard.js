function createDashboardService({ query }) {
  async function getBoards(dateStr = null, gradeContext = null, showAllClasses = false) {
    let sections;
    const sevenDaysAgo = new Date(Date.now() + 8 * 60 * 60 * 1000 - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (dateStr) {
      sections = await query.all(`
        SELECT board_sections.*, users.name AS updater_name
        FROM board_sections
        LEFT JOIN users ON users.id = board_sections.updated_by
        WHERE board_sections.section_date = ?
        AND board_sections.section_date >= ?
        ORDER BY board_sections.board_id, board_sections.section
      `, [dateStr, sevenDaysAgo]);
    } else {
      sections = await query.all(`
        SELECT board_sections.*, users.name AS updater_name
        FROM board_sections
        LEFT JOIN users ON users.id = board_sections.updated_by
        WHERE board_sections.section_date = date('now', 'localtime')
        ORDER BY board_sections.board_id, board_sections.section
      `);
    }

    let boards = await query.all('SELECT * FROM boards ORDER BY sort_order, name');

    if (gradeContext && gradeContext.grade) {
      const grade = gradeContext.grade;
      const isG6G8 = ['G6', 'G7', 'G8'].includes(grade);
      const userClass = gradeContext.class_name;

      const permissions = await query.all(`
        SELECT board_id, is_shared FROM subject_grade_permissions WHERE grade = ?
      `, [grade]);

      const permMap = new Map(permissions.map(p => [p.board_id, p.is_shared]));
      boards = boards.filter(board => permMap.has(board.id));

      if (isG6G8) {
        const classes = await query.all(
          'SELECT class_name FROM grade_classes WHERE grade = ? ORDER BY sort_order, class_name',
          [grade]
        );

        const expandedBoards = [];
        for (const board of boards) {
          const isShared = permMap.get(board.id);
          if (isShared) {
            expandedBoards.push({
              ...board,
              display_name: board.name,
              display_name_en: board.name_en,
              is_shared: true,
              class_name: null
            });
          } else {
            if (showAllClasses) {
              for (const cls of classes) {
                expandedBoards.push({
                  ...board,
                  display_name: `${board.name}(${cls.class_name})`,
                  display_name_en: `${board.name_en}(${cls.class_name})`,
                  is_shared: false,
                  class_name: cls.class_name
                });
              }
            } else if (userClass) {
              expandedBoards.push({
                ...board,
                display_name: `${board.name}(${userClass})`,
                display_name_en: `${board.name_en}(${userClass})`,
                is_shared: false,
                class_name: userClass
              });
            }
          }
        }
        boards = expandedBoards;
      } else {
        boards = boards.map(board => ({
          ...board,
          display_name: board.name,
          display_name_en: board.name_en,
          is_shared: true,
          class_name: null
        }));
      }
    } else {
      boards = boards.map(board => ({
        ...board,
        display_name: board.name,
        display_name_en: board.name_en,
        is_shared: true,
        class_name: null
      }));
    }

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

  async function getDashboardData(user, dateStr = null, gradeContext = null, showAllClasses = false) {
    const boards = await getBoards(dateStr, gradeContext, showAllClasses);
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

  return {
    getBoards,
    getDashboardData
  };
}

module.exports = {
  createDashboardService
};

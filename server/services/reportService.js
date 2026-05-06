const TARGET_TYPES = {
  POST: 'post',
  COMMENT: 'comment',
  CHAT: 'chat',
  RESOURCE: 'resource',
  CJ: 'cj'
};

const REPORT_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  DISMISSED: 'dismissed'
};

function createReportService({ query, creditService, notificationService, getUserLevel }) {
  async function submitReport(reporterId, targetType, targetId, reason, forcedTargetUserId = null) {
    const reporter = await query.get('SELECT role_level FROM users WHERE id = ?', [reporterId]);
    if (!reporter || reporter.role_level < 1) {
      throw new Error('LV1及以上用户才能举报');
    }

    const dailyCount = await query.get(
      `SELECT COUNT(*) AS count FROM reports
       WHERE reporter_id = ? AND date(created_at) = date('now')`,
      [reporterId]
    );

    const maxReports = reporter.role_level >= 5 ? 20 : reporter.role_level >= 3 ? 10 : 5;
    if (dailyCount && dailyCount.count >= maxReports) {
      throw new Error(`每日举报上限为${maxReports}次`);
    }

    let targetUserId = forcedTargetUserId;
    let minReviewerLevel = 4;

    if (!targetUserId) {
      if (targetType === TARGET_TYPES.POST) {
        const post = await query.get('SELECT user_id FROM posts WHERE id = ?', [targetId]);
        if (post) targetUserId = post.user_id;
      } else if (targetType === TARGET_TYPES.COMMENT) {
        const comment = await query.get('SELECT user_id FROM comments WHERE id = ?', [targetId]);
        if (comment) targetUserId = comment.user_id;
      } else if (targetType === TARGET_TYPES.CHAT) {
        const chat = await query.get('SELECT user_id FROM chat_messages WHERE id = ?', [targetId]);
        if (chat) targetUserId = chat.user_id;
      } else if (targetType === TARGET_TYPES.RESOURCE) {
        const resource = await query.get('SELECT uploaded_by FROM resources WHERE id = ?', [targetId]);
        if (resource) targetUserId = resource.uploaded_by;
      } else if (targetType === TARGET_TYPES.CJ) {
        targetUserId = null;
      }
    }

    if (targetUserId) {
      const targetUser = await query.get('SELECT role_level FROM users WHERE id = ?', [targetUserId]);
      if (targetUser) {
        minReviewerLevel = getMinReviewerLevel(targetUser.role_level);
      }
    }

    const existingReport = await query.get(
      `SELECT id FROM reports 
       WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'pending'`,
      [reporterId, targetType, targetId]
    );

    if (existingReport) {
      throw new Error('您已举报过此内容，请等待处理');
    }

    const result = await query.run(
      `INSERT INTO reports (reporter_id, target_type, target_id, target_user_id, reason, min_reviewer_level, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [reporterId, targetType, targetId, targetUserId, reason, minReviewerLevel]
    );

    return {
      reportId: result.lastID,
      targetType,
      targetId,
      minReviewerLevel
    };
  }

  async function processReport(reportId, reviewerId, decision, reason) {
    const report = await query.get('SELECT * FROM reports WHERE id = ?', [reportId]);
    if (!report) {
      throw new Error('举报不存在');
    }

    if (report.status !== REPORT_STATUS.PENDING) {
      throw new Error('该举报已处理');
    }

    const reviewerLevel = await getUserLevelById(reviewerId);
    if (reviewerLevel < report.min_reviewer_level) {
      throw new Error(`该举报需要LV${report.min_reviewer_level}及以上权限处理`);
    }

    const newStatus = decision === 'verify' ? REPORT_STATUS.VERIFIED : REPORT_STATUS.DISMISSED;

    await query.run(
      `UPDATE reports 
       SET status = ?, reviewer_id = ?, review_result = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newStatus, reviewerId, reason, reportId]
    );

    if (decision === 'verify') {
      await handleVerifiedReport(report, reviewerId);
    } else {
      await handleDismissedReport(report, reason);
    }

    return {
      reportId,
      decision,
      newStatus
    };
  }

  async function handleVerifiedReport(report, reviewerId) {
    let reporterReward = 3;
    let targetCreditDelta = 0;
    let targetCreditReason = '';

    switch (report.target_type) {
      case TARGET_TYPES.CHAT:
        targetCreditDelta = -5;
        targetCreditReason = '聊天消息被举报成立';
        reporterReward = 1;
        break;
      case TARGET_TYPES.POST:
        targetCreditDelta = -15;
        targetCreditReason = '帖子被举报成立';
        reporterReward = 5;
        break;
      case TARGET_TYPES.COMMENT:
        targetCreditDelta = -8;
        targetCreditReason = '评论被举报成立';
        reporterReward = 3;
        break;
      case TARGET_TYPES.RESOURCE:
        targetCreditDelta = -10;
        targetCreditReason = '资源被举报成立';
        reporterReward = 5;
        break;
      case TARGET_TYPES.CJ:
        targetCreditDelta = -10;
        targetCreditReason = 'CJ内容被举报成立';
        reporterReward = 3;
        break;
    }

    if (report.target_user_id && targetCreditDelta !== 0) {
      await creditService.changeCredit(report.target_user_id, targetCreditDelta, targetCreditReason, reviewerId);
    }

    await creditService.changeCredit(report.reporter_id, reporterReward, '举报成功奖励', reviewerId);

    await notificationService.createNotification(
      report.reporter_id,
      '举报结果',
      `您的举报已成立，获得${reporterReward}积分奖励`,
      'interaction'
    );

    if (report.target_user_id) {
      await notificationService.createNotification(
        report.target_user_id,
        '违规通知',
        `您的${getTargetTypeLabel(report.target_type)}因被举报存在违规行为，已受到处理`,
        'system'
      );
    }
  }

  async function handleDismissedReport(report, reason) {
    await notificationService.createNotification(
      report.reporter_id,
      '举报结果',
      `您的举报经审核不成立：${reason}`,
      'interaction'
    );
  }

  async function getReportQueue(reviewerLevel, filters = {}) {
    const { status = 'pending', page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let whereClause = "r.status = ?";
    let params = [status];

    if (reviewerLevel === 4) {
      whereClause += " AND r.min_reviewer_level <= 5";
    } else if (reviewerLevel === 5) {
      whereClause += " AND r.min_reviewer_level <= 5";
    }

    const reports = await query.all(`
      SELECT r.*,
             reporter.name AS reporter_name,
             target.name AS target_name,
             target.role_level AS target_role_level,
             reviewer.name AS reviewer_name,
             (SELECT COUNT(*) FROM reports WHERE target_user_id = r.target_user_id AND status = 'pending') AS pending_count_for_target
      FROM reports r
      JOIN users reporter ON reporter.id = r.reporter_id
      LEFT JOIN users target ON target.id = r.target_user_id
      LEFT JOIN users reviewer ON reviewer.id = r.reviewer_id
      WHERE ${whereClause}
      ORDER BY r.min_reviewer_level DESC, datetime(r.created_at) DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const filteredReports = reports.filter(r => {
      if (!r.target_user_id || !r.target_role_level) return true;
      if (r.target_role_level === 5 && r.pending_count_for_target < 3) return false;
      if (r.target_role_level === 55 && r.pending_count_for_target < 5) return false;
      return true;
    });

    const countRow = await query.get(`
      SELECT COUNT(*) AS total FROM reports r WHERE ${whereClause}
    `, params);

    return {
      reports: filteredReports,
      pagination: {
        page,
        limit,
        total: filteredReports.length,
        totalItems: filteredReports.length,
        totalPages: Math.ceil(filteredReports.length / limit)
      }
    };
  }

  async function getReportStats(reviewerLevel) {
    let whereClause = '';
    if (reviewerLevel === 4) {
      whereClause = "WHERE min_reviewer_level <= 5";
    } else if (reviewerLevel === 5) {
      whereClause = "WHERE min_reviewer_level <= 5";
    }

    const stats = await query.get(`
      SELECT 
        COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending,
        COUNT(CASE WHEN status = 'verified' THEN 1 END) AS verified,
        COUNT(CASE WHEN status = 'dismissed' THEN 1 END) AS dismissed
      FROM reports
      ${whereClause}
    `);

    return stats || { pending: 0, verified: 0, dismissed: 0 };
  }

  function getMinReviewerLevel(targetLevel) {
    if (targetLevel >= 55) return 6;
    if (targetLevel === 5) return 55;
    if (targetLevel === 4) return 5;
    if (targetLevel === 3) return 4;
    return 4;
  }

  async function getUserLevelById(userId) {
    const user = await query.get('SELECT role_level FROM users WHERE id = ?', [userId]);
    return user?.role_level || 0;
  }

  function getTargetTypeLabel(targetType) {
    const labels = {
      [TARGET_TYPES.POST]: '帖子',
      [TARGET_TYPES.COMMENT]: '评论',
      [TARGET_TYPES.CHAT]: '聊天消息',
      [TARGET_TYPES.RESOURCE]: '资源',
      [TARGET_TYPES.CJ]: 'CJ内容'
    };
    return labels[targetType] || '内容';
  }

  return {
    submitReport,
    processReport,
    getReportQueue,
    getReportStats,
    TARGET_TYPES,
    REPORT_STATUS
  };
}

module.exports = {
  createReportService,
  TARGET_TYPES,
  REPORT_STATUS
};

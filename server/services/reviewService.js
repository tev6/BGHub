const REVIEW_STAGES = {
  PENDING_AI: 'pending_ai',
  AI_REVIEWING: 'ai_reviewing',
  AI_REJECTED: 'ai_rejected',
  PENDING_HUMAN: 'pending_human',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const ITEM_TYPES = {
  POST: 'post',
  CHAT: 'chat',
  RESOURCE: 'resource',
  HOMEWORK: 'homework'
};

const logger = require('../utils/logger');

function createReviewService({ query, creditService, notificationService, moderation, getUserLevel }) {
  async function submitForReview(itemType, itemId, userId, content, options = {}) {
    const { skipAI = false, payload = '' } = options;
    const userLevel = await getUserLevelById(userId);

    let reviewStage = REVIEW_STAGES.PENDING_HUMAN;
    let aiReviewed = 0;

    if (!skipAI && needsAIReview(userLevel, itemType)) {
      reviewStage = REVIEW_STAGES.PENDING_AI;
      aiReviewed = 0;
    } else if (skipAI || canSkipAIReview(userLevel, itemType)) {
      reviewStage = REVIEW_STAGES.PENDING_HUMAN;
      aiReviewed = 1;
    }

    const result = await query.run(
      `INSERT INTO review_items (item_type, item_id, created_by, payload, status, review_stage, ai_reviewed)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      [itemType, itemId, userId, payload || content?.substring(0, 500) || '', reviewStage, aiReviewed]
    );

    if (reviewStage === REVIEW_STAGES.PENDING_AI) {
      await processAIReview(itemType, itemId, result.lastID);
    }

    return {
      reviewId: result.lastID,
      reviewStage,
      needsAI: reviewStage === REVIEW_STAGES.PENDING_AI
    };
  }

  async function processAIReview(itemType, itemId, reviewId) {
    const reviewItem = await query.get('SELECT * FROM review_items WHERE id = ?', [reviewId]);
    if (!reviewItem) return null;

    await query.run(
      "UPDATE review_items SET review_stage = ?, ai_reviewed = 1 WHERE id = ?",
      [REVIEW_STAGES.AI_REVIEWING, reviewId]
    );

    let content = '';
    if (itemType === ITEM_TYPES.POST) {
      const post = await query.get('SELECT title, content FROM posts WHERE id = ?', [itemId]);
      content = post ? `${post.title}\n${post.content}` : '';
    } else if (itemType === ITEM_TYPES.CHAT) {
      const chat = await query.get('SELECT content FROM chat_messages WHERE id = ?', [itemId]);
      content = chat?.content || '';
    } else if (itemType === ITEM_TYPES.RESOURCE) {
      const resource = await query.get('SELECT title, description FROM resources WHERE id = ?', [itemId]);
      content = resource ? `${resource.title}\n${resource.description || ''}` : '';
    }

    let aiResult = 'pass';
    let aiReason = '';

    try {
      const moderationResult = await moderation.moderateContent(content);
      aiResult = moderationResult.decision === 'PASS' ? 'pass' : 'reject';
      aiReason = moderationResult.reason || '';
    } catch (error) {
      logger.error('[ReviewService] AI moderation error', { 
        error: error.message,
        stack: error.stack 
      });
      aiResult = 'pass';
      aiReason = `AI服务异常: ${error.message}`;
    }

    const newStage = aiResult === 'pass' ? REVIEW_STAGES.PENDING_HUMAN : REVIEW_STAGES.AI_REJECTED;

    await query.run(
      `UPDATE review_items 
       SET review_stage = ?, ai_result = ?, ai_reason = ?, ai_reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newStage, aiResult, aiReason, reviewId]
    );

    if (aiResult === 'reject') {
      if (itemType === ITEM_TYPES.POST) {
        await query.run("UPDATE posts SET review_status = 'rejected' WHERE id = ?", [itemId]);
      } else if (itemType === ITEM_TYPES.CHAT) {
        await query.run("UPDATE chat_messages SET status = 'rejected' WHERE id = ?", [itemId]);
      } else if (itemType === ITEM_TYPES.RESOURCE) {
        await query.run("UPDATE resources SET status = 'rejected' WHERE id = ?", [itemId]);
      }

      await creditService.changeCredit(reviewItem.created_by, -5, 'AI审核未通过', null);

      await notificationService.createNotification(
        reviewItem.created_by,
        '内容审核未通过',
        `您的${getItemTypeLabel(itemType)}未通过AI审核：${aiReason}`,
        'review'
      );
    } else {
      if (itemType === ITEM_TYPES.POST) {
        await query.run("UPDATE posts SET review_status = 'pending' WHERE id = ?", [itemId]);
      } else if (itemType === ITEM_TYPES.CHAT) {
        await query.run("UPDATE chat_messages SET status = 'pending' WHERE id = ?", [itemId]);
      }
    }

    return {
      reviewId,
      aiResult,
      newStage
    };
  }

  async function processHumanReview(reviewId, reviewerId, decision, reason) {
    const reviewItem = await query.get('SELECT * FROM review_items WHERE id = ?', [reviewId]);
    if (!reviewItem) {
      throw new Error('审核项不存在');
    }

    if (reviewItem.status !== 'pending') {
      throw new Error('该审核项已处理');
    }

    if (reviewItem.review_stage !== REVIEW_STAGES.PENDING_HUMAN) {
      throw new Error('该审核项不在人工审核阶段');
    }

    const reviewerLevel = await getUserLevelById(reviewerId);
    if (!canReview(reviewerLevel, reviewItem.item_type, reviewItem.created_by)) {
      throw new Error('权限不足');
    }

    const newStage = decision === 'approve' ? REVIEW_STAGES.APPROVED : REVIEW_STAGES.REJECTED;
    const newStatus = decision === 'approve' ? 'approved' : 'rejected';

    await query.run(
      `UPDATE review_items 
       SET status = ?, review_stage = ?, reviewer_id = ?, decision_reason = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newStatus, newStage, reviewerId, reason, reviewId]
    );

    await query.run(
      'INSERT INTO review_actions (review_id, reviewer_id, action, reason) VALUES (?, ?, ?, ?)',
      [reviewId, reviewerId, decision, reason]
    );

    const { item_type, item_id, created_by } = reviewItem;

    if (decision === 'approve') {
      if (item_type === ITEM_TYPES.POST) {
        await query.run("UPDATE posts SET review_status = 'approved' WHERE id = ?", [item_id]);
      } else if (item_type === ITEM_TYPES.CHAT) {
        await query.run("UPDATE chat_messages SET status = 'approved' WHERE id = ?", [item_id]);
      } else if (item_type === ITEM_TYPES.RESOURCE) {
        await query.run("UPDATE resources SET status = 'approved' WHERE id = ?", [item_id]);
      }

      const creditDelta = reviewerLevel === 3 ? 5 : 3;
      await creditService.changeCredit(created_by, creditDelta, '审核通过奖励', reviewerId);
    } else {
      if (item_type === ITEM_TYPES.POST) {
        await query.run("UPDATE posts SET review_status = 'rejected' WHERE id = ?", [item_id]);
      } else if (item_type === ITEM_TYPES.CHAT) {
        await query.run("UPDATE chat_messages SET status = 'rejected' WHERE id = ?", [item_id]);
      } else if (item_type === ITEM_TYPES.RESOURCE) {
        await query.run("UPDATE resources SET status = 'rejected' WHERE id = ?", [item_id]);
      }

      const creditDelta = reviewerLevel === 3 ? -5 : -3;
      await creditService.changeCredit(created_by, creditDelta, '审核驳回扣减', reviewerId);
    }

    const actionText = decision === 'approve' ? '通过' : '驳回';
    await notificationService.createNotification(
      created_by,
      `内容审核${actionText}`,
      `您的${getItemTypeLabel(item_type)}已${actionText}审核：${reason}`,
      'review'
    );

    return {
      reviewId,
      decision,
      newStage,
      newStatus
    };
  }

  async function getReviewQueue(reviewerLevel, filters = {}) {
    const { stage, itemType, status = 'pending', page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let whereConditions = ["ri.status = ?"];
    let params = [status];

    if (stage) {
      whereConditions.push("ri.review_stage = ?");
      params.push(stage);
    }

    if (itemType) {
      whereConditions.push("ri.item_type = ?");
      params.push(itemType);
    }

    if (reviewerLevel === 3) {
      whereConditions.push("ri.item_type = 'chat'");
    } else if (reviewerLevel === 4) {
      whereConditions.push("ri.item_type IN ('chat', 'post')");
    }

    const whereClause = whereConditions.join(' AND ');

    const items = await query.all(`
      SELECT ri.*,
             u.name AS author_name,
             u.role_level AS author_level
      FROM review_items ri
      JOIN users u ON u.id = ri.created_by
      WHERE ${whereClause}
      ORDER BY 
        CASE ri.review_stage 
          WHEN 'pending_human' THEN 1 
          WHEN 'ai_reviewing' THEN 2 
          WHEN 'pending_ai' THEN 3 
          ELSE 4 
        END,
        datetime(ri.created_at) DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const countRow = await query.get(`
      SELECT COUNT(*) AS total 
      FROM review_items ri
      WHERE ${whereClause}
    `, params);

    return {
      items,
      pagination: {
        page,
        limit,
        total: countRow?.total || 0,
        totalPages: Math.ceil((countRow?.total || 0) / limit)
      }
    };
  }

  async function getReviewStats(reviewerLevel) {
    let typeFilter = '';
    if (reviewerLevel === 3) {
      typeFilter = "AND item_type = 'chat'";
    } else if (reviewerLevel === 4) {
      typeFilter = "AND item_type IN ('chat', 'post')";
    }

    const stats = await query.get(`
      SELECT 
        COUNT(CASE WHEN status = 'pending' AND review_stage = 'pending_human' THEN 1 END) AS pending_human,
        COUNT(CASE WHEN status = 'pending' AND review_stage = 'ai_reviewing' THEN 1 END) AS ai_reviewing,
        COUNT(CASE WHEN status = 'pending' AND review_stage = 'pending_ai' THEN 1 END) AS pending_ai,
        COUNT(CASE WHEN status = 'pending' AND review_stage = 'ai_rejected' THEN 1 END) AS ai_rejected,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) AS rejected
      FROM review_items
      WHERE 1=1 ${typeFilter}
    `);

    return stats || {
      pending_human: 0,
      ai_reviewing: 0,
      pending_ai: 0,
      ai_rejected: 0,
      approved: 0,
      rejected: 0
    };
  }

  async function getReviewItemDetail(reviewId) {
    const item = await query.get(`
      SELECT ri.*, u.name AS author_name, u.email AS author_email, u.role_level AS author_level
      FROM review_items ri
      JOIN users u ON u.id = ri.created_by
      WHERE ri.id = ?
    `, [reviewId]);

    if (!item) return null;

    let content = null;
    if (item.item_type === ITEM_TYPES.POST) {
      content = await query.get('SELECT * FROM posts WHERE id = ?', [item.item_id]);
    } else if (item.item_type === ITEM_TYPES.CHAT) {
      content = await query.get('SELECT * FROM chat_messages WHERE id = ?', [item.item_id]);
    } else if (item.item_type === ITEM_TYPES.RESOURCE) {
      content = await query.get('SELECT * FROM resources WHERE id = ?', [item.item_id]);
    }

    const history = await query.all(`
      SELECT ra.*, u.name AS reviewer_name
      FROM review_actions ra
      JOIN users u ON u.id = ra.reviewer_id
      WHERE ra.review_id = ?
      ORDER BY datetime(ra.created_at) DESC
    `, [reviewId]);

    return { item, content, history };
  }

  function needsAIReview(userLevel, itemType) {
    if (itemType === ITEM_TYPES.CHAT) {
      return userLevel <= 1;
    }
    if (itemType === ITEM_TYPES.POST || itemType === ITEM_TYPES.RESOURCE) {
      return userLevel <= 3;
    }
    return false;
  }

  function canSkipAIReview(userLevel, itemType) {
    if (itemType === ITEM_TYPES.CHAT) {
      return userLevel >= 2;
    }
    if (itemType === ITEM_TYPES.POST || itemType === ITEM_TYPES.RESOURCE) {
      return userLevel >= 4;
    }
    return true;
  }

  function canReview(reviewerLevel, itemType, authorId) {
    if (reviewerLevel === 3) {
      return itemType === ITEM_TYPES.CHAT;
    }
    if (reviewerLevel === 4) {
      return itemType === ITEM_TYPES.CHAT || itemType === ITEM_TYPES.POST;
    }
    if (reviewerLevel >= 5) {
      return true;
    }
    return false;
  }

  async function getUserLevelById(userId) {
    if (typeof getUserLevel === 'function') {
      return getUserLevel(userId);
    }
    const user = await query.get('SELECT role_level FROM users WHERE id = ?', [userId]);
    return user?.role_level || 0;
  }

  function getItemTypeLabel(itemType) {
    const labels = {
      [ITEM_TYPES.POST]: '帖子',
      [ITEM_TYPES.CHAT]: '聊天消息',
      [ITEM_TYPES.RESOURCE]: '资源',
      [ITEM_TYPES.HOMEWORK]: '作业'
    };
    return labels[itemType] || '内容';
  }

  return {
    submitForReview,
    processAIReview,
    processHumanReview,
    getReviewQueue,
    getReviewStats,
    getReviewItemDetail,
    REVIEW_STAGES,
    ITEM_TYPES
  };
}

module.exports = {
  createReviewService,
  REVIEW_STAGES,
  ITEM_TYPES
};

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createReviewService, REVIEW_STAGES, ITEM_TYPES } = require('../server/services/reviewService');

describe('ReviewService', () => {
  let reviewService;
  let mockQuery;
  let mockCreditService;
  let mockNotificationService;
  let mockModeration;
  let mockGetUserLevel;
  let insertedItems;

  beforeEach(() => {
    insertedItems = [];
    
    mockQuery = {
      run: async (sql, params) => {
        if (sql.includes('INSERT INTO review_items')) {
          const id = insertedItems.length + 1;
          insertedItems.push({ id, params });
          return { lastID: id };
        }
        return { changes: 1 };
      },
      get: async (sql, params) => {
        if (sql.includes('SELECT * FROM review_items')) {
          return { id: params[0], created_by: 1, item_type: 'post', item_id: 1, status: 'pending', review_stage: REVIEW_STAGES.PENDING_HUMAN };
        }
        if (sql.includes('SELECT role_level FROM users')) {
          return { role_level: 2 };
        }
        if (sql.includes('SELECT title, content FROM posts')) {
          return { title: 'Test Post', content: 'Test content' };
        }
        return null;
      },
      all: async (sql, params) => []
    };

    mockCreditService = {
      changeCredit: async () => ({ credit: 10, delta: 5 })
    };

    mockNotificationService = {
      createNotification: async () => {}
    };

    mockModeration = {
      moderateContent: async () => ({ decision: 'PASS', reason: '' })
    };

    mockGetUserLevel = async () => 2;

    reviewService = createReviewService({
      query: mockQuery,
      creditService: mockCreditService,
      notificationService: mockNotificationService,
      moderation: mockModeration,
      getUserLevel: mockGetUserLevel
    });
  });

  describe('submitForReview', () => {
    it('should create review item with pending_human stage for LV4+ users on post', async () => {
      mockGetUserLevel = async () => 4;
      reviewService = createReviewService({
        query: mockQuery,
        creditService: mockCreditService,
        notificationService: mockNotificationService,
        moderation: mockModeration,
        getUserLevel: mockGetUserLevel
      });

      const result = await reviewService.submitForReview(ITEM_TYPES.POST, 1, 1, 'Test content');

      assert.strictEqual(result.reviewStage, REVIEW_STAGES.PENDING_HUMAN);
      assert.ok(result.reviewId > 0);
    });

    it('should create review item with pending_ai stage for LV0-LV1 users on chat', async () => {
      mockGetUserLevel = async () => 1;
      reviewService = createReviewService({
        query: mockQuery,
        creditService: mockCreditService,
        notificationService: mockNotificationService,
        moderation: mockModeration,
        getUserLevel: mockGetUserLevel
      });

      const result = await reviewService.submitForReview(ITEM_TYPES.CHAT, 1, 1, 'Test message');

      assert.strictEqual(result.reviewStage, REVIEW_STAGES.PENDING_AI);
    });

    it('should create review item with pending_human stage for LV2+ users on chat (skip AI)', async () => {
      mockGetUserLevel = async () => 2;
      reviewService = createReviewService({
        query: mockQuery,
        creditService: mockCreditService,
        notificationService: mockNotificationService,
        moderation: mockModeration,
        getUserLevel: mockGetUserLevel
      });

      const result = await reviewService.submitForReview(ITEM_TYPES.CHAT, 1, 1, 'Test message');

      assert.strictEqual(result.reviewStage, REVIEW_STAGES.PENDING_HUMAN);
    });
  });

  describe('processHumanReview', () => {
    it('should approve review item and update status', async () => {
      const mockGetUserLevelForReview = async (userId) => {
        if (userId === 2) return 3;
        return 1;
      };
      
      const localMockQuery = {
        run: async () => ({ lastID: 1, changes: 1 }),
        get: async (sql, params) => {
          if (sql.includes('SELECT * FROM review_items')) {
            return {
              id: 1,
              created_by: 1,
              item_type: 'chat',
              item_id: 1,
              status: 'pending',
              review_stage: REVIEW_STAGES.PENDING_HUMAN
            };
          }
          return null;
        },
        all: async () => []
      };
      
      reviewService = createReviewService({
        query: localMockQuery,
        creditService: mockCreditService,
        notificationService: mockNotificationService,
        moderation: mockModeration,
        getUserLevel: mockGetUserLevelForReview
      });

      const result = await reviewService.processHumanReview(1, 2, 'approve', 'Good content');

      assert.strictEqual(result.decision, 'approve');
      assert.strictEqual(result.newStage, REVIEW_STAGES.APPROVED);
    });

    it('should reject review item with negative credit', async () => {
      const mockGetUserLevelForReview = async (userId) => {
        if (userId === 2) return 3;
        return 1;
      };
      
      const localMockQuery = {
        run: async () => ({ lastID: 1, changes: 1 }),
        get: async (sql, params) => {
          if (sql.includes('SELECT * FROM review_items')) {
            return {
              id: 1,
              created_by: 1,
              item_type: 'chat',
              item_id: 1,
              status: 'pending',
              review_stage: REVIEW_STAGES.PENDING_HUMAN
            };
          }
          return null;
        },
        all: async () => []
      };
      
      reviewService = createReviewService({
        query: localMockQuery,
        creditService: mockCreditService,
        notificationService: mockNotificationService,
        moderation: mockModeration,
        getUserLevel: mockGetUserLevelForReview
      });

      const result = await reviewService.processHumanReview(1, 2, 'reject', 'Inappropriate content');

      assert.strictEqual(result.decision, 'reject');
      assert.strictEqual(result.newStage, REVIEW_STAGES.REJECTED);
    });

    it('should throw error for already processed item', async () => {
      mockQuery.get = async (sql, params) => {
        if (sql.includes('SELECT * FROM review_items')) {
          return {
            id: 1,
            status: 'approved',
            review_stage: REVIEW_STAGES.APPROVED
          };
        }
        return null;
      };

      await assert.rejects(
        async () => await reviewService.processHumanReview(1, 2, 'approve', 'Test'),
        { message: '该审核项已处理' }
      );
    });

    it('should throw error when LV3 tries to review post', async () => {
      mockQuery.get = async (sql, params) => {
        if (sql.includes('SELECT * FROM review_items')) {
          return {
            id: 1,
            created_by: 1,
            item_type: 'post',
            item_id: 1,
            status: 'pending',
            review_stage: REVIEW_STAGES.PENDING_HUMAN
          };
        }
        if (sql.includes('SELECT role_level FROM users')) {
          return { role_level: 3 };
        }
        return null;
      };

      await assert.rejects(
        async () => await reviewService.processHumanReview(1, 2, 'approve', 'Test'),
        { message: '权限不足' }
      );
    });
  });

  describe('getReviewQueue', () => {
    it('should return filtered queue for LV3 users (chat only)', async () => {
      mockQuery.all = async (sql, params) => {
        if (sql.includes('FROM review_items')) {
          return [
            { id: 1, item_type: 'chat', review_stage: REVIEW_STAGES.PENDING_HUMAN }
          ];
        }
        return [];
      };

      mockQuery.get = async (sql, params) => {
        if (sql.includes('COUNT(*)')) {
          return { total: 1 };
        }
        return null;
      };

      const result = await reviewService.getReviewQueue(3, { status: 'pending' });

      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.pagination.total, 1);
    });
  });

  describe('REVIEW_STAGES', () => {
    it('should have all required stages', () => {
      assert.ok(REVIEW_STAGES.PENDING_AI);
      assert.ok(REVIEW_STAGES.AI_REVIEWING);
      assert.ok(REVIEW_STAGES.AI_REJECTED);
      assert.ok(REVIEW_STAGES.PENDING_HUMAN);
      assert.ok(REVIEW_STAGES.APPROVED);
      assert.ok(REVIEW_STAGES.REJECTED);
    });
  });
});

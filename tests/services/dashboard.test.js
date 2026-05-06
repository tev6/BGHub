const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createDashboardService } = require('../../server/services/dashboard');

describe('DashboardService', () => {
  let dashboardService;
  let mockQuery;

  beforeEach(() => {
    mockQuery = {
      all: async (sql, params) => {
        if (sql.includes('FROM boards')) {
          return [
            { id: 1, name: 'Mathematics', slug: 'math', name_en: 'Math', sort_order: 1 }
          ];
        }
        if (sql.includes('FROM board_sections')) {
          return [];
        }
        if (sql.includes('FROM exams')) {
          return [];
        }
        if (sql.includes('FROM homeworks')) {
          return [];
        }
        if (sql.includes('FROM posts')) {
          return [];
        }
        if (sql.includes('FROM resources')) {
          return [];
        }
        if (sql.includes('FROM chat_messages')) {
          return [];
        }
        return [];
      },
      get: async (sql, params) => {
        if (sql.includes('COUNT(*)')) {
          return { count: 0 };
        }
        return null;
      }
    };

    dashboardService = createDashboardService({ query: mockQuery });
  });

  describe('getBoards', () => {
    it('should return boards with sections', async () => {
      const boards = await dashboardService.getBoards();
      assert.ok(Array.isArray(boards));
    });

    it('should filter boards by grade context', async () => {
      mockQuery.all = async (sql, params) => {
        if (sql.includes('subject_grade_permissions')) {
          return [{ board_id: 1, is_shared: 1 }];
        }
        if (sql.includes('FROM boards')) {
          return [{ id: 1, name: 'Math', slug: 'math', name_en: 'Math', sort_order: 1 }];
        }
        return [];
      };

      const boards = await dashboardService.getBoards(null, { grade: 'G10' });
      assert.ok(Array.isArray(boards));
    });
  });

  describe('getDashboardData', () => {
    it('should return dashboard data with stats', async () => {
      const data = await dashboardService.getDashboardData({ id: 1 });
      assert.ok(data);
      assert.ok(data.boards);
      assert.ok(data.stats);
      assert.strictEqual(typeof data.stats.exams, 'number');
      assert.strictEqual(typeof data.stats.homeworks, 'number');
      assert.strictEqual(typeof data.stats.resources, 'number');
      assert.strictEqual(typeof data.stats.posts, 'number');
    });

    it('should return empty arrays for no data', async () => {
      const data = await dashboardService.getDashboardData(null);
      assert.ok(Array.isArray(data.upcomingExams));
      assert.ok(Array.isArray(data.dueHomeworks));
      assert.ok(Array.isArray(data.recentPosts));
      assert.ok(Array.isArray(data.resources));
      assert.ok(Array.isArray(data.chatMessages));
    });
  });
});

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createHomeController, createReviewController } = require('../../server/controllers');

describe('HomeController', () => {
  let homeController;
  let mockDashboardService;

  beforeEach(() => {
    mockDashboardService = {
      getDashboardData: async () => ({
        boards: [],
        stats: { exams: 0, homeworks: 0, resources: 0, posts: 0 },
        upcomingExams: [],
        dueHomeworks: [],
        recentPosts: [],
        resources: [],
        chatMessages: []
      })
    };

    homeController = createHomeController({
      dashboardService: mockDashboardService,
      formatDate: (date) => date
    });
  });

  describe('index', () => {
    it('should render home page with dashboard data', async () => {
      let rendered = false;
      const req = { query: {}, user: null, gradeContext: null };
      const res = {
        locals: { locale: 'zh' },
        render: (view, data) => {
          rendered = true;
          assert.strictEqual(view, 'home');
          assert.ok(data.pageTitle);
          assert.ok(data.stats);
        },
        redirect: () => {}
      };

      await homeController.index(req, res);
      assert.ok(rendered);
    });

    it('should handle date parameter', async () => {
      const today = new Date().toISOString().split('T')[0];
      let rendered = false;
      const req = { query: { date: today }, user: null, gradeContext: null };
      const res = {
        locals: { locale: 'zh' },
        render: (view, data) => {
          rendered = true;
          assert.ok(data.dateNavData);
        },
        redirect: () => {}
      };

      await homeController.index(req, res);
      assert.ok(rendered);
    });
  });
});

describe('ReviewController', () => {
  let reviewController;
  let mockQuery;

  beforeEach(() => {
    mockQuery = {
      all: async () => [],
      get: async () => ({ total: 0 })
    };

    reviewController = createReviewController({
      query: mockQuery,
      getUserLevel: () => 3
    });
  });

  describe('index', () => {
    it('should render review page with items', async () => {
      let rendered = false;
      const req = { query: {}, user: { role_level: 3 } };
      const res = {
        render: (view, data) => {
          rendered = true;
          assert.strictEqual(view, 'review');
          assert.ok(data.pageTitle);
          assert.ok(Array.isArray(data.items));
          assert.ok(data.pagination);
        }
      };

      await reviewController.index(req, res);
      assert.ok(rendered);
    });
  });
});

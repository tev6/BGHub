const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createReportService, TARGET_TYPES, REPORT_STATUS } = require('../server/services/reportService');

describe('ReportService', () => {
  let reportService;
  let mockQuery;
  let mockCreditService;
  let mockNotificationService;
  let mockGetUserLevel;

  beforeEach(() => {
    mockQuery = {
      run: async () => ({ lastID: 1, changes: 1 }),
      get: async (sql, params) => {
        if (sql.includes('SELECT role_level FROM users')) {
          return { role_level: 2 };
        }
        if (sql.includes('SELECT user_id FROM posts')) {
          return { user_id: 2 };
        }
        if (sql.includes('SELECT COUNT(*)')) {
          return { count: 0 };
        }
        if (sql.includes('SELECT * FROM reports')) {
          return {
            id: 1,
            reporter_id: 1,
            target_type: 'post',
            target_id: 1,
            target_user_id: 2,
            status: 'pending',
            min_reviewer_level: 4
          };
        }
        return null;
      },
      all: async () => []
    };

    mockCreditService = {
      changeCredit: async () => ({ credit: 10, delta: 5 })
    };

    mockNotificationService = {
      createNotification: async () => {}
    };

    mockGetUserLevel = async () => 4;

    reportService = createReportService({
      query: mockQuery,
      creditService: mockCreditService,
      notificationService: mockNotificationService,
      getUserLevel: mockGetUserLevel
    });
  });

  describe('submitReport', () => {
    it('should create report for LV1+ users', async () => {
      mockQuery.get = async (sql, params) => {
        if (sql.includes('SELECT role_level FROM users')) {
          return { role_level: 2 };
        }
        if (sql.includes('SELECT user_id FROM posts')) {
          return { user_id: 3 };
        }
        if (sql.includes('SELECT COUNT(*)')) {
          return { count: 0 };
        }
        return null;
      };

      const result = await reportService.submitReport(1, TARGET_TYPES.POST, 1, 'Spam content');

      assert.ok(result.reportId > 0);
      assert.strictEqual(result.targetType, TARGET_TYPES.POST);
    });

    it('should reject report from LV0 users', async () => {
      mockQuery.get = async (sql, params) => {
        if (sql.includes('SELECT role_level FROM users')) {
          return { role_level: 0 };
        }
        return null;
      };

      await assert.rejects(
        async () => await reportService.submitReport(1, TARGET_TYPES.POST, 1, 'Spam'),
        { message: 'LV1及以上用户才能举报' }
      );
    });

    it('should enforce daily report limit', async () => {
      mockQuery.get = async (sql, params) => {
        if (sql.includes('SELECT role_level FROM users')) {
          return { role_level: 2 };
        }
        if (sql.includes('SELECT COUNT(*) AS count FROM reports')) {
          return { count: 5 };
        }
        return null;
      };

      await assert.rejects(
        async () => await reportService.submitReport(1, TARGET_TYPES.POST, 1, 'Spam'),
        { message: /每日举报上限/ }
      );
    });
  });

  describe('processReport', () => {
    it('should verify report and reward reporter', async () => {
      mockQuery.get = async (sql, params) => {
        if (sql.includes('SELECT * FROM reports')) {
          return {
            id: 1,
            reporter_id: 1,
            target_type: 'post',
            target_id: 1,
            target_user_id: 2,
            status: 'pending',
            min_reviewer_level: 4
          };
        }
        if (sql.includes('SELECT role_level FROM users')) {
          return { role_level: 4 };
        }
        return null;
      };

      const result = await reportService.processReport(1, 2, 'verify', 'Confirmed spam');

      assert.strictEqual(result.decision, 'verify');
      assert.strictEqual(result.newStatus, REPORT_STATUS.VERIFIED);
    });

    it('should dismiss report', async () => {
      mockQuery.get = async (sql, params) => {
        if (sql.includes('SELECT * FROM reports')) {
          return {
            id: 1,
            reporter_id: 1,
            target_type: 'post',
            target_id: 1,
            target_user_id: 2,
            status: 'pending',
            min_reviewer_level: 4
          };
        }
        if (sql.includes('SELECT role_level FROM users')) {
          return { role_level: 4 };
        }
        return null;
      };

      const result = await reportService.processReport(1, 2, 'dismiss', 'Not spam');

      assert.strictEqual(result.decision, 'dismiss');
      assert.strictEqual(result.newStatus, REPORT_STATUS.DISMISSED);
    });

    it('should reject if reviewer level is too low', async () => {
      mockQuery.get = async (sql, params) => {
        if (sql.includes('SELECT * FROM reports')) {
          return {
            id: 1,
            reporter_id: 1,
            target_type: 'post',
            target_id: 1,
            target_user_id: 2,
            status: 'pending',
            min_reviewer_level: 5
          };
        }
        if (sql.includes('SELECT role_level FROM users')) {
          return { role_level: 4 };
        }
        return null;
      };

      await assert.rejects(
        async () => await reportService.processReport(1, 2, 'verify', 'Spam'),
        { message: /需要LV5及以上权限/ }
      );
    });
  });

  describe('getReportQueue', () => {
    it('should return filtered queue based on reviewer level', async () => {
      mockQuery.all = async () => [
        { id: 1, target_type: 'post', status: 'pending' }
      ];
      mockQuery.get = async (sql, params) => {
        if (sql.includes('COUNT(*)')) {
          return { total: 1 };
        }
        return null;
      };

      const result = await reportService.getReportQueue(4, { status: 'pending' });

      assert.ok(Array.isArray(result.reports));
      assert.ok(result.pagination);
    });
  });

  describe('TARGET_TYPES', () => {
    it('should have all required target types', () => {
      assert.ok(TARGET_TYPES.POST);
      assert.ok(TARGET_TYPES.COMMENT);
      assert.ok(TARGET_TYPES.CHAT);
      assert.ok(TARGET_TYPES.RESOURCE);
    });
  });

  describe('REPORT_STATUS', () => {
    it('should have all required statuses', () => {
      assert.ok(REPORT_STATUS.PENDING);
      assert.ok(REPORT_STATUS.VERIFIED);
      assert.ok(REPORT_STATUS.DISMISSED);
    });
  });
});

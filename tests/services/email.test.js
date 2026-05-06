const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createEmailService } = require('../../server/services/email');

describe('EmailService', () => {
  let emailService;
  let mockQuery;
  let mockResend;

  beforeEach(() => {
    mockQuery = {
      run: async () => ({ changes: 1 })
    };

    mockResend = {
      emails: {
        send: async () => ({ data: { id: 'test-id' } })
      }
    };

    emailService = createEmailService({ query: mockQuery, resend: mockResend });
  });

  describe('sendVerificationEmail', () => {
    it('should return null when API key not configured', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      process.env.RESEND_API_KEY = 're_xxxxxxxxx';

      const result = await emailService.sendVerificationEmail('test@example.com');
      assert.strictEqual(result, null);

      process.env.RESEND_API_KEY = originalKey;
    });
  });

  describe('sendNotificationEmail', () => {
    it('should return false when API key not configured', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      process.env.RESEND_API_KEY = 're_xxxxxxxxx';

      const result = await emailService.sendNotificationEmail('test@example.com', 'Test', '<p>Test</p>');
      assert.strictEqual(result, false);

      process.env.RESEND_API_KEY = originalKey;
    });
  });
});

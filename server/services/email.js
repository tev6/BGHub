const logger = require('../utils/logger');

function createEmailService({ query, resend }) {
  async function sendVerificationEmail(userEmail) {
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_xxxxxxxxx') {
      logger.debug('[Email] Resend API key not configured, skipping verification email');
      return null;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await query.run(
      'INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)',
      [userEmail, code, expiresAt.toISOString()]
    );

    try {
      const result = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to: userEmail,
        subject: 'BG Hub 注册验证码',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #3255c4;">BG Hub 注册验证码</h2>
            <p>您好，感谢您注册 BG Hub！</p>
            <p>您的验证码是：<strong style="font-size: 24px; color: #3255c4;">${code}</strong></p>
            <p>验证码将在 <strong>10 分钟</strong>后过期，请尽快完成验证。</p>
            <p>如果这不是您本人的操作，请忽略此邮件。</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">此邮件由系统自动发送，请勿回复。</p>
          </div>
        `
      });
      logger.info('[Email] Verification code sent', { 
        email: userEmail,
        messageId: result.data?.id 
      });
      return code;
    } catch (error) {
      logger.error('[Email] Failed to send verification email', { 
        email: userEmail,
        error: error.message,
        status: error.status,
        code: error.code 
      });
      return null;
    }
  }

  async function sendNotificationEmail(userEmail, subject, content) {
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_xxxxxxxxx') {
      logger.debug('[Email] Resend API key not configured, skipping notification email');
      return false;
    }

    try {
      const result = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to: userEmail,
        subject,
        html: content
      });
      logger.info('[Email] Notification sent', { 
        email: userEmail,
        messageId: result.data?.id 
      });
      return true;
    } catch (error) {
      logger.error('[Email] Failed to send notification email', { 
        email: userEmail,
        error: error.message 
      });
      return false;
    }
  }

  return {
    sendVerificationEmail,
    sendNotificationEmail
  };
}

module.exports = {
  createEmailService
};

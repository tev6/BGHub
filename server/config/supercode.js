const crypto = require('crypto');

module.exports = {
  encrypted: 'a1b2c3d4e5f6...',
  secret: 'T2OXNpYLx1M2IpNiHfcZZYvxqfhyF0T6',
  iv: '0123456789abcdef0123456789abcdef'
};

function encryptSupercode(supercode) {
  const secret = 'T2OXNpYLx1M2IpNiHfcZZYvxqfhyF0T6';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    crypto.createHash('sha256').update(secret).digest(),
    iv
  );
  const encrypted = Buffer.concat([cipher.update(supercode), cipher.final()]);
  return {
    encrypted: encrypted.toString('hex'),
    secret,
    iv: iv.toString('hex')
  };
}

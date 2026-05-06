function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function parseDateValue(value) {
  return value ? new Date(value) : null;
}

module.exports = {
  validateEmail,
  parseDateValue
};

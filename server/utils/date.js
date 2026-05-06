const CST_OFFSET = 8 * 60 * 60 * 1000;

function buildCountdown(dateValue) {
  if (!dateValue) {
    return '待定';
  }

  const target = new Date(dateValue);
  const cstNow = new Date(Date.now() + CST_OFFSET);
  const cstTarget = new Date(target.getTime() + CST_OFFSET);
  const diff = cstTarget.getTime() - cstNow.getTime();
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));

  if (days > 1) {
    return `还剩 ${days} 天`;
  }

  if (days === 1) {
    return '明天';
  }

  if (days === 0) {
    return '今天';
  }

  return `已过 ${Math.abs(days)} 天`;
}

function formatDate(dateValue, includeTime = false) {
  if (!dateValue) {
    return '—';
  }

  const date = new Date(dateValue);
  const cstDate = new Date(date.getTime() + CST_OFFSET);

  if (Number.isNaN(cstDate.getTime())) {
    return '—';
  }

  return includeTime
    ? cstDate.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
    : cstDate.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function todayStr() {
  const now = new Date(Date.now() + CST_OFFSET);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = { buildCountdown, formatDate, todayStr };
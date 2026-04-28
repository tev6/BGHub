/**
 * 格式化日期为中文本地化字符串
 * @param {string|Date} dateValue - 日期值,可以是字符串或 Date 对象
 * @param {boolean} includeTime - 是否包含时间部分,默认为 false
 * @returns {string} 格式化后的日期字符串,无效日期返回 '—'
 */
export function formatDate(dateValue, includeTime = false) {
  if (!dateValue) return '—';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '—';
  return includeTime
    ? date.toLocaleString('zh-CN', { hour12: false })
    : date.toLocaleDateString('zh-CN');
}

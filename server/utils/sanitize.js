const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify')(new JSDOM('').window);

function sanitizeHtml(dirty) {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class']
  });
}

function sanitizeAvatarUrl(url) {
  if (!url) return '/img/default-avatar.png';
  if (/^javascript:/i.test(url)) return '/img/default-avatar.png';
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) return '/img/default-avatar.png';
  return url;
}

function sanitizeUserInput(input) {
  if (typeof input !== 'string') return '';
  return input.trim();
}

function addLinkSecurity(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const links = document.querySelectorAll('a[href]');

  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });

  return document.body.innerHTML;
}

module.exports = {
  sanitizeHtml,
  sanitizeAvatarUrl,
  sanitizeUserInput,
  addLinkSecurity
};
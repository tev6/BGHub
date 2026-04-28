const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify');
const marked = require('marked');

const window = new JSDOM('').window;
const purify = DOMPurify(window);

marked.setOptions({
  gfm: true,
  breaks: true
});

function renderMarkdown(content) {
  if (!content) {
    return '';
  }

  let html = marked.parse(String(content).trim());
  html = purify.sanitize(html, {
    ADD_ATTR: ['target', 'rel']
  });

  const tempDiv = window.document.createElement('div');
  tempDiv.innerHTML = html;
  const links = tempDiv.querySelectorAll('a[href]');
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });

  return tempDiv.innerHTML;
}

module.exports = renderMarkdown;
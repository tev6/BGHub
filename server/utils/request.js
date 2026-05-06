function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function wantsJson(req) {
  return req.path.startsWith('/api/');
}

function respondError(req, res, statusCode, message) {
  if (wantsJson(req)) {
    res.status(statusCode).json({ error: message });
    return;
  }

  if (statusCode >= 500) {
    res.status(statusCode).render('login', {
      pageTitle: '系统错误',
      formMode: null,
      errors: [message]
    });
    return;
  }

  const referer = req.get('Referer');
  const redirectUrl = referer && !referer.includes(req.originalUrl) ? referer : '/';
  setFlash(req, 'error', message);
  res.redirect(redirectUrl);
}

module.exports = {
  setFlash,
  wantsJson,
  respondError
};

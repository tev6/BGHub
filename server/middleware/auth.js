function getUserLevel(user) {
  return Math.max(0, Number(user && user.role_level != null ? user.role_level : 0));
}

function isStaff(user) {
  return getUserLevel(user) >= 3;
}

function wantsJson(req) {
  return Boolean(
    req.xhr ||
    req.headers.accept?.includes('application/json') ||
    req.path.startsWith('/api/')
  );
}

function respondError(req, res, statusCode, message) {
  if (wantsJson(req)) {
    res.status(statusCode).json({ error: message });
    return true;
  }

  req.session.flash = { type: 'error', message };
  res.redirect('back');
  return true;
}

function requireAuth(req, res, next) {
  if (!req.user) {
    if (wantsJson(req)) {
      res.status(401).json({ error: '请先登录' });
      return;
    }

    req.session.flash = { type: 'error', message: '请先登录后再继续' };
    res.redirect('/login');
    return;
  }

  next();
}

function requireStaff(req, res, next) {
  if (!isStaff(req.user)) {
    respondError(req, res, 403, '当前账号没有该操作权限');
    return;
  }

  next();
}

function requireLevel(level) {
  return function guard(req, res, next) {
    const userLv = getUserLevel(req.user);
    let hasAccess = false;
    if (level <= 5) {
      hasAccess = userLv >= level || userLv === 55;
    } else {
      hasAccess = userLv === 6;
    }
    if (!hasAccess) {
      respondError(req, res, 403, '当前账号没有该操作权限');
      return;
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireStaff,
  requireLevel,
  isStaff,
  getUserLevel
};
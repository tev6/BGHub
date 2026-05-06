function getUserLevel(user) {
  return Math.max(0, Number(user && user.role_level != null ? user.role_level : 0));
}

function isStaff(user) {
  return getUserLevel(user) >= 3;
}

function canManagePost(user, post) {
  if (!user || !post) return false;
  if (user.id === post.user_id) return true;
  if (user.role_level === 6) return true;
  return false;
}

function canMarkBestAnswer(user, post) {
  if (!user || !post) return false;
  if (user.id === post.user_id) return true;
  if (user.role_level === 6) return true;
  return false;
}

module.exports = {
  getUserLevel,
  isStaff,
  canManagePost,
  canMarkBestAnswer
};

# BG Hub 代码风格规范

## 1. 命名约定

### 变量与函数

| 类型 | 规范 | 示例 |
|------|------|------|
| 变量 | camelCase | `userId`, `isActive` |
| 常量 | UPPER_SNAKE | `MAX_FILE_SIZE` |
| 函数 | camelCase | `getUserById()`, `syncUserLevel()` |
| 类/构造函数 | PascalCase | `DatabaseHelper` |
| 文件名 | kebab-case | `app.js`, `user-service.js` |
| SQL 表名 | snake_case | `user_credit`, `credit_log` |

### 示例

```javascript
// ✅ 正确
const userId = 123;
const MAX_RETRY_COUNT = 3;
function getUserById(id) { }

// ❌ 错误
const user_id = 123;
const maxRetryCount = 3;
function get_user_by_id(id) { }
```

## 2. 缩进与格式

- **使用 2 空格缩进**（不使用 Tab）
- **始终使用分号**
- **单行最多 120 字符**
- **关键字后加空格**：`if (condition) {`

## 3. 异步处理

```javascript
// ✅ 正确：使用 async/await
async function getUser(id) {
  const user = await query.get('SELECT * FROM users WHERE id = ?', [id]);
  return user;
}

// ❌ 错误：避免嵌套回调
function getUser(id, callback) {
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
    if (err) callback(err);
    callback(null, user);
  });
}
```

## 4. 错误处理

```javascript
// ✅ 正确：try-catch 在路由处理器中
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await getUser(req.params.id);
    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }
    res.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ✅ 正确：Promise rejection 处理
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: '服务器内部错误' });
});
```

## 5. SQL 规范

```javascript
// ✅ 正确：参数化查询防注入
await query.get('SELECT * FROM users WHERE id = ?', [userId]);

// ❌ 错误：字符串拼接（SQL 注入风险）
await query.get(`SELECT * FROM users WHERE id = ${userId}`);

// ✅ 正确：多值参数
await query.all('SELECT * FROM posts WHERE board_id IN (?, ?, ?)', [id1, id2, id3]);

// ✅ 正确：事务处理
async function runTransaction(callback) {
  await query.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    const result = await callback();
    await query.run('COMMIT');
    return result;
  } catch (error) {
    await query.run('ROLLBACK');
    throw error;
  }
}
```

## 6. 路由组织规范

```javascript
// app.js 路由组织示例

// 1. 认证路由
app.get('/login', ...);
app.post('/login', ...);
app.get('/register', ...);
app.post('/register', ...);
app.post('/logout', ...);

// 2. 主要功能路由
app.get('/forum', ...);
app.get('/forum/new', requireAuth, ...);
app.get('/forum/:id', ...);
app.post('/forum/posts', requireAuth, ...);

// 3. API 路由（统一前缀 /api）
app.get('/api/dashboard', ...);
app.get('/api/boards', ...);
app.post('/api/forum/posts', requireAuth, ...);

// 4. 管理后台路由
app.get('/admin/review', requireAuth, requireLevel(3), ...);
app.post('/api/admin/credit', requireAuth, requireLevel(6), ...);
```

## 7. 中间件顺序

```javascript
// 1. 基础中间件
app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadDir));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 2. 会话中间件
app.use(session({ ... }));

// 3. 应用级中间件（用户认证）
app.use(async (req, res, next) => {
  // 设置 req.user
  next();
});

// 4. 路由处理器

// 5. 错误处理中间件（4 个参数）
app.use((error, req, res, next) => { ... });
```

## 8. 注释规范

- 使用 JSDoc 风格的注释
- 函数必须包含参数和返回值说明
- 复杂逻辑需要添加解释注释

```javascript
/**
 * 获取用户积分信息
 * @param {number} userId - 用户ID
 * @returns {Promise<Object>} 用户积分对象
 */
async function getUserCredit(userId) {
  // 实现
}
```

## 9. 模块导出

```javascript
// ✅ 正确：清晰的模块导出
module.exports = {
  createAuthRoutes,
  createForumRoutes,
  createBoardRoutes
};

// ✅ 正确：单个导出
module.exports = createCJRoutes;
```

## 10. 常量定义

```javascript
// ✅ 正确：集中定义常量
const CREDIT_CONFIG = {
  MIN_FOR_LV1: 11,
  MIN_FOR_LV2: 41,
  MIN_FOR_LV3: 101,
  MAX_CREDIT: 500
};

const USER_ROLES = {
  STUDENT: 'student',
  MODERATOR: 'moderator',
  ADMIN: 'admin'
};
```

## 11. 代码格式化

运行 `npm run format` 使用 Prettier 自动格式化代码。

## 12. Git 提交规范

```
feat: 添加新功能
fix: 修复错误
docs: 文档更新
style: 代码格式（不影响功能）
refactor: 重构
test: 测试相关
chore: 构建/工具相关
```
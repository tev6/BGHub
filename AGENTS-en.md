# BIGZ Hub Technical Development Documentation (AGENTS)

[中文](AGENTS.md) | English

---

## Document Purpose

This documentation is intended for developers and AI Agents, providing comprehensive information about BIGZ Hub's technical architecture, implementation details, development standards, and extension guidelines.

---

## Part 1: Project Architecture

### 1.1 System Architecture Overview

BIGZ Hub employs a classic three-tier Web application architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  (Browser - EJS Template Rendering / AJAX API Calls)         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Application Layer                     │
│  (Express 5 - Routes, Middleware, Business Logic)            │
│  ┌──────────┬──────────┬──────────┬──────────┐            │
│  │  Auth    │  Forum   │ Resource │  Admin   │              │
│  │  Module  │  Module  │  Module  │  Module  │              │
│  └──────────┴──────────┴──────────┴──────────┘            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                          Data Layer                          │
│  (SQLite 3 - Table Structure, Session Storage, File Storage) │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack Details

| Layer | Technology | Version | Description |
|-------|------------|---------|-------------|
| Runtime | Node.js | ≥18.0.0 | Async non-blocking I/O |
| Web Framework | Express | 5.x | Async/await route handlers |
| Template Engine | EJS | 3.x | Embedded JavaScript templates |
| Database | SQLite3 | 5.x | Local file database |
| Session Store | connect-sqlite3 | 0.9.x | SQLite-backed sessions |
| Password Hashing | bcryptjs | 3.x | Secure password hashing |
| Markdown | marked | 15.x | Markdown to HTML conversion |
| HTML Sanitization | dompurify + jsdom | 3.x / 26.x | XSS protection |
| File Upload | multer | 2.x | multipart/form-data handling |
| Real-time Communication | ws | 8.x | WebSocket (to be implemented) |
| Test Framework | node:test | built-in | Node.js official testing |

### 1.3 Core Module Structure

```
app.js (Entry Point)
├── Application Configuration Module
│   ├── createApp() - Application factory function
│   ├── Database initialization - initializeDatabase()
│   └── Static resources and middleware configuration
│
├── Utility Functions Module
│   ├── slugify() - URL-friendly string conversion
│   ├── stripHtml() - HTML tag removal
│   ├── excerpt() - Text summary extraction
│   ├── extractFirstImageUrl() - Image URL extraction
│   ├── buildCountdown() - Countdown calculation
│   ├── renderMarkdown() - Markdown rendering
│   └── formatDate() - Date formatting
│
├── Database Access Layer (createDatabaseHelpers)
│   ├── query.run() - Insert/Update/Delete operations
│   ├── query.get() - Single record query
│   └── query.all() - Multiple records query
│
├── Business Logic Layer
│   ├── Authentication Module - validateEmail, ensureCreditRecord
│   ├── Credit System - changeCredit, syncUserLevel
│   ├── Content Management - getForumPosts, getPostDetail
│   └── Search System - searchAll
│
├── Middleware Layer
│   ├── requireAuth - Login verification
│   ├── requireStaff - Permission verification
│   ├── requireLevel() - Level verification
│   └── rateLimit() - Rate limiting
│
└── Route Handler Layer
    ├── GET/POST / - Home page dashboard
    ├── /auth - Authentication routes
    ├── /forum - Forum routes
    ├── /boards - Subject board routes
    ├── /exams - Exam routes
    ├── /homeworks - Homework routes
    ├── /resources - Resource routes
    ├── /api/* - REST API routes
    └── /admin/* - Admin backend routes
```

---

## Part 2: Database Design

### 2.1 ER Diagram

```
users
    │
    ├── 1:N ──── user_credit (user points)
    │                │
    │                └── 1:N ──── credit_log (credit change log)
    │
    ├── 1:N ──── posts
    │                │
    │                └── 1:N ──── comments
    │
    ├── 1:N ──── chat_messages
    │
    ├── 1:N ──── resources
    │
    ├── 1:N ──── notifications
    │
    └── 1:N ──── review_items (pending review items)

boards (subject boards)
    │
    └── 1:N ──── board_sections (board content sections)
    │
    └── 1:N ──── exams
    │
    └── 1:N ──── homeworks

roles (role levels)
    │
    └── 1:N ──── users (user role assignment)
```

### 2.2 Core Table Structures

#### users table

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  grade TEXT NOT NULL,                    -- G6-G12
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',    -- student/moderator/admin
  role_level INTEGER NOT NULL DEFAULT 0,   -- LV0-LV6
  created_at DATETIME NOT NULL,
  banned_until DATETIME,
  muted_until DATETIME
);
```

#### boards table

```sql
CREATE TABLE boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,              -- URL identifier (mathematics, english...)
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4f46e5',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL
);
```

#### posts table

```sql
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,                  -- Markdown content
  post_type TEXT NOT NULL DEFAULT 'question', -- question/note/share
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  is_resolved INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  review_status TEXT NOT NULL DEFAULT 'approved', -- approved/pending/rejected
  view_count INTEGER NOT NULL DEFAULT 0,
  user_id INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(board_id) REFERENCES boards(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

#### Credit-Related Tables

```sql
CREATE TABLE roles (
  level INTEGER PRIMARY KEY,               -- LV0-LV6
  min_credit INTEGER NOT NULL,
  name TEXT NOT NULL,
  badge_color TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE user_credit (
  user_id INTEGER PRIMARY KEY,
  credit INTEGER NOT NULL DEFAULT 0,      -- Current points (0-1000)
  last_login_date TEXT,                   -- Last login date (for daily reward)
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE credit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reviewer_id INTEGER,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

### 2.3 Index Design

```sql
-- User query optimization
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role_level ON users(role_level);

-- Forum query optimization
CREATE INDEX idx_posts_board_id ON posts(board_id);
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at);
CREATE INDEX idx_posts_review_status ON posts(review_status);

-- Comment query optimization
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);

-- Homework query optimization
CREATE INDEX idx_homeworks_board_id ON homeworks(board_id);
CREATE INDEX idx_homeworks_deadline ON homeworks(deadline);

-- Review query optimization
CREATE INDEX idx_review_items_status ON review_items(status);
CREATE INDEX idx_review_items_created_by ON review_items(created_by);
```

---

## Part 3: Key Algorithms and Data Flows

### 3.1 Credit System Algorithm

#### Daily Login Credit Reward

```javascript
async function applyDailyLoginCredit(userId) {
  // 1. Get user's credit record
  const creditRow = await ensureCreditRecord(userId);
  const today = currentDateKey(); // YYYY-MM-DD format

  // 2. Check if already claimed today
  if (creditRow.last_login_date === today) {
    return false; // Already claimed
  }

  // 3. Update login date
  await query.run(
    'UPDATE user_credit SET last_login_date = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
    [today, userId]
  );

  // 4. Grant daily reward
  await changeCredit(userId, 10, 'Daily login reward', null);
  return true;
}
```

#### Credit Change and Level Sync

```javascript
async function changeCredit(userId, delta, reason, reviewerId) {
  return runTransaction(async () => {
    // 1. Get current credit
    const creditRow = await ensureCreditRecord(userId);

    // 2. Calculate actual delta (max 1000, min 0)
    let actualDelta = Number(delta || 0);
    if (creditRow.credit >= 999 && actualDelta > 0) {
      // At limit, only fill to 1000
      actualDelta = Math.max(0, 1000 - creditRow.credit);
    } else if (creditRow.credit + actualDelta > 1000) {
      actualDelta = Math.max(0, 1000 - creditRow.credit);
    } else if (creditRow.credit + actualDelta < 0) {
      actualDelta = -creditRow.credit;
    }

    // 3. Update credit
    const nextCredit = clampCredit(creditRow.credit + actualDelta);
    await query.run(
      'UPDATE user_credit SET credit = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [nextCredit, userId]
    );

    // 4. Log credit change
    await query.run(
      'INSERT INTO credit_log (user_id, delta, reason, reviewer_id) VALUES (?, ?, ?, ?)',
      [userId, actualDelta, reason, reviewerId]
    );

    // 5. Sync user level
    await syncUserLevel(userId);

    return { credit: nextCredit, delta: actualDelta };
  });
}
```

#### Level Synchronization Algorithm

```javascript
async function syncUserLevel(userId) {
  // 1. Get current credit
  const creditRow = await ensureCreditRecord(userId);

  // 2. Find highest level meeting credit requirement
  const roleRow = await query.get(`
    SELECT * FROM roles
    WHERE min_credit <= ?
    ORDER BY level DESC
    LIMIT 1
  `, [creditRow.credit]);

  // 3. Calculate new level (admin level cannot be demoted)
  const existingUser = await query.get('SELECT role_level, role FROM users WHERE id = ?', [userId]);
  const nextLevel = existingUser.role_level === 6 ? 6 : (roleRow ? roleRow.level : 0);
  const nextRole = nextLevel >= 6 ? 'admin' : (nextLevel >= 3 ? 'moderator' : 'student');

  // 4. If level changed, update and notify
  if (existingUser.role_level !== nextLevel || existingUser.role !== nextRole) {
    await query.run('UPDATE users SET role_level = ?, role = ? WHERE id = ?', [nextLevel, nextRole, userId]);
    // Send level change notification and email
  }

  return nextLevel;
}
```

### 3.2 Rate Limiting Algorithm

```javascript
function rateLimit({ windowMs, max, keyPrefix }) {
  return async function limiter(req, res, next) {
    // 1. Identify user (logged in or IP)
    const userId = req.user ? req.user.id : null;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const identity = userId ? `u:${userId}` : `ip:${ip}`;

    // 2. Construct rate limit key
    const routeKey = `${keyPrefix}:${req.method}:${req.path}`;
    const key = `${routeKey}:${identity}`;
    const now = Date.now();

    // 3. Check and update count
    const entry = rateLimiterState.get(key) || { count: 0, startAt: now };

    if (now - entry.startAt > windowMs) {
      entry.count = 0;
      entry.startAt = now;
    }

    entry.count += 1;
    rateLimiterState.set(key, entry);

    // 4. Reject if exceeded
    if (entry.count > max) {
      await query.run('INSERT INTO rate_limit_log (user_id, ip, route) VALUES (?, ?, ?)', [userId, ip, routeKey]);
      res.status(429).json({ error: 'Rate limit exceeded, please try again later' });
      return;
    }

    next();
  };
}
```

### 3.3 Content Review Flow

```
User submits content
      │
      ▼
┌─────────────────┐
│ Permission Check │ ── LV0-LV1 ──► Add to pending queue
└─────────────────┘
      │
      ▼ (LV2+)
┌─────────────────┐
│ Auto-approve     │
└─────────────────┘
      │
      ▼
Content published / Resource visible
```

### 3.4 Markdown Rendering and Security

```javascript
// Markdown configuration
marked.setOptions({
  gfm: true,   // GitHub Flavored Markdown
  breaks: true // Convert line breaks to <br>
});

// Safe rendering function
function renderMarkdown(content) {
  if (!content) return '';

  // 1. Markdown to HTML
  const html = marked.parse(String(content).trim());

  // 2. DOMPurify sanitize XSS
  return DOMPurify.sanitize(html);
}
```

---

## Part 4: API Specification

### 4.1 API Design Principles

- **RESTful Style**: Use HTTP method semantics (GET/POST/PUT/DELETE)
- **JSON First**: API routes return JSON, HTML routes return pages
- **Consistent Error Handling**: Unified error response format `{ error: string }` or `{ errors: string[] }`
- **Authentication Aware**: Use `wantsJson(req)` to determine response format

### 4.2 Request/Response Specification

#### Authentication Request

```javascript
// Request
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

// Success Response (200)
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "Username",
    "grade": "G10",
    "role": "student",
    "role_level": 0,
    "credit": 10
  }
}

// Failure Response (401)
{
  "error": "Invalid email or password"
}
```

#### Pagination Response

```javascript
// List response (future version)
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### 4.3 Permission Level Requirements

| API Endpoint | Permission Required |
|--------------|---------------------|
| GET /api/* | Public/Requires login |
| POST /api/forum/posts | Requires login |
| POST /api/exams | LV3+ (moderator) |
| POST /api/homeworks | LV3+ (moderator) |
| POST /api/resources | Requires login |
| GET /api/review/items | LV3+ |
| POST /api/review/items/:id/approve | LV3+ |
| GET /api/admin/logs | LV5+ |
| POST /api/admin/credit | LV6 (admin) |

---

## Part 5: Development Standards

### 5.1 Code Style

#### Indentation and Formatting

- **Use 2-space indentation** (no tabs)
- **Always use semicolons**
- **Maximum 120 characters per line**
- **Space after keywords**: `if (condition) {`

#### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Variables | camelCase | `userId`, `isActive` |
| Constants | UPPER_SNAKE | `MAX_FILE_SIZE` |
| Functions | camelCase | `getUserById()`, `syncUserLevel()` |
| Classes/Constructors | PascalCase | `DatabaseHelper` |
| Filenames | kebab-case | `app.js`, `user-service.js` |
| SQL Tables | snake_case | `user_credit`, `credit_log` |
| Config Items | SCREAMING_SNAKE | `SESSION_SECRET` |

#### Async Handling

```javascript
// ✅ Correct: Use async/await
async function getUser(id) {
  const user = await query.get('SELECT * FROM users WHERE id = ?', [id]);
  return user;
}

// ❌ Wrong: Avoid nested callbacks
function getUser(id, callback) {
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
    if (err) callback(err);
    callback(null, user);
  });
}
```

#### Error Handling

```javascript
// ✅ Correct: try-catch in route handlers
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await getUser(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ Correct: Promise rejection handling
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});
```

### 5.2 SQL Standards

```javascript
// ✅ Correct: Parameterized queries prevent injection
await query.get('SELECT * FROM users WHERE id = ?', [userId]);

// ❌ Wrong: String concatenation (SQL injection risk)
await query.get(`SELECT * FROM users WHERE id = ${userId}`);

// ✅ Correct: Multiple values
await query.all('SELECT * FROM posts WHERE board_id IN (?, ?, ?)', [id1, id2, id3]);

// ✅ Correct: Transaction handling
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

### 5.3 Route Organization Standards

```javascript
// app.js route organization example

// 1. Authentication routes
app.get('/login', ...);
app.post('/login', ...);
app.get('/register', ...);
app.post('/register', ...);
app.post('/logout', ...);

// 2. Main feature routes
app.get('/forum', ...);
app.get('/forum/new', requireAuth, ...);
app.get('/forum/:id', ...);
app.post('/forum/posts', requireAuth, ...);

// 3. API routes (unified prefix /api)
app.get('/api/dashboard', ...);
app.get('/api/boards', ...);
app.post('/api/forum/posts', requireAuth, ...);

// 4. Admin backend routes
app.get('/admin/review', requireAuth, requireLevel(3), ...);
app.post('/api/admin/credit', requireAuth, requireLevel(6), ...);
```

### 5.4 Middleware Order

```javascript
// 1. Base middleware
app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadDir));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 2. Session middleware
app.use(session({ ... }));

// 3. Application-level middleware (user authentication)
app.use(async (req, res, next) => {
  // Set req.user
  next();
});

// 4. Route handlers

// 5. Error handling middleware (4 parameters)
app.use((error, req, res, next) => { ... });
```

---

## Part 6: Testing Strategy

### 6.1 Test Framework

Uses Node.js built-in `node:test` module, no additional dependencies required:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
```

### 6.2 Test Case Example

```javascript
test('Register and auto-login first user', async () => {
  const response = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@test.com',
      password: 'password123',
      name: 'Admin User',
      grade: 'G12'
    })
  });

  const data = await response.json();
  assert.strictEqual(response.status, 201);
  assert.strictEqual(data.user.role, 'admin');
  assert.strictEqual(data.user.role_level, 4);
});
```

### 6.3 Test Coverage Scope

| Module | Test Cases |
|--------|------------|
| Authentication | Registration, login, logout, permission checks |
| Forum | Post creation, comments, editing, deletion, search |
| Boards | Get boards, CJ content updates |
| Exams | Create exams, filtering, countdown |
| Homework | Create homework, toggle completion status |
| Resources | Upload resources, download count, likes |
| Search | Keyword search, multiple result types |
| Admin | Review flow, credit adjustment, user ban |

### 6.4 Running Tests

```bash
npm test
```

---

## Part 7: Performance Optimization

### 7.1 Database Optimization

#### Avoid N+1 Queries

```javascript
// ❌ Wrong: N+1 query
const posts = await query.all('SELECT * FROM posts');
for (const post of posts) {
  post.author = await query.get('SELECT name FROM users WHERE id = ?', [post.user_id]);
}

// ✅ Correct: JOIN query
const posts = await query.all(`
  SELECT posts.*, users.name AS author_name
  FROM posts
  JOIN users ON users.id = posts.user_id
`);
```

#### Use Indexes

```javascript
// Add indexes for frequently queried fields
await query.run('CREATE INDEX IF NOT EXISTS idx_posts_board_id ON posts(board_id)');
await query.run('CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at)');
```

### 7.2 Caching Strategy

#### Session Caching

```javascript
// Static resources set cache headers
app.use('/public', express.static(publicDir, {
  maxAge: '1d',
  etag: true
}));
```

### 7.3 Rate Limiting Configuration

```javascript
// Different rate limits for different endpoints
app.post('/api/forum/posts', requireAuth, rateLimit({ windowMs: 60000, max: 5, keyPrefix: 'post' }));
app.post('/api/chat/messages', requireAuth, rateLimit({ windowMs: 60000, max: 10, keyPrefix: 'chat' }));
app.post('/api/review/items/:id/approve', requireAuth, requireLevel(3), rateLimit({ windowMs: 60000, max: 10, keyPrefix: 'review' }));
```

---

## Part 8: Security Considerations

### 8.1 XSS Protection

- All user-input Markdown content is sanitized through `DOMPurify.sanitize()`
- EJS templates escape HTML by default

### 8.2 SQL Injection Prevention

- All SQL queries use parameterized queries
- String concatenation in SQL is prohibited

### 8.3 CSRF Protection

- Uses express-session signed cookies
- Form submissions use POST and verify session

### 8.4 Password Security

- Passwords encrypted using bcryptjs (cost factor 10)
- Minimum password length is 8 characters

### 8.5 Sensitive Operations Require Secondary Verification

```javascript
// Admin operations require additional password verification
app.post('/api/admin/credit', requireAuth, requireLevel(6), async (req, res) => {
  const password = String(req.body.password || '');
  const admin = await query.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);

  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    res.status(403).json({ error: 'Password verification failed' });
    return;
  }
  // Execute operation...
});
```

---

## Part 9: Extension Mechanisms

### 9.1 Adding New Modules

1. **Database**: Add new tables in `initializeDatabase()`
2. **Routes**: Add route handlers in `app.js`
3. **Views**: Add EJS templates in `views/`
4. **API**: Add API endpoints in `app.js` `/api/*` route group
5. **Tests**: Add test cases in `tests/`

### 9.2 Plugin-Style Feature Extension

```javascript
// Example: Add rating feature
async function addRatingFeature(postId, userId, rating) {
  // 1. Create rating table
  await query.run(`
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      created_at DATETIME NOT NULL,
      UNIQUE(post_id, user_id)
    )
  `);

  // 2. Insert or update rating
  await query.run(`
    INSERT INTO ratings (post_id, user_id, rating)
    VALUES (?, ?, ?)
    ON CONFLICT(post_id, user_id) DO UPDATE SET rating = excluded.rating
  `, [postId, userId, rating]);

  // 3. Update post average rating
  const avgRating = await query.get(`
    SELECT AVG(rating) as avg FROM ratings WHERE post_id = ?
  `, [postId]);
  await query.run('UPDATE posts SET avg_rating = ? WHERE id = ?', [avgRating.avg, postId]);
}
```

### 9.3 WebSocket Extension (To Be Implemented)

```javascript
// WebSocket server initialization
const { WebSocketServer } = require('ws');

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // 1. Parse session from cookie to get user
    // 2. Associate ws with userId
    // 3. Handle message broadcasting
  });

  return wss;
}

// Broadcast new post
function broadcastNewPost(post) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(JSON.stringify({ type: 'new_post', data: post }));
    }
  });
}
```

---

## Part 10: Deployment Guide

### 10.1 Production Environment Checklist

- [ ] `SESSION_SECRET` set to a strong random string
- [ ] `NODE_ENV=production`
- [ ] Database file `data/bigz-hub-mvp.db` backed up regularly
- [ ] `uploads/` directory uses independent persistent storage
- [ ] Configure web server reverse proxy (Nginx)
- [ ] Configure SSL/TLS certificate
- [ ] Set up log rotation
- [ ] Configure monitoring and alerting

### 10.2 Nginx Reverse Proxy Configuration

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 10.3 Database Backup

```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/path/to/backups
cp $PROJECT_DIR/data/bigz-hub-mvp.db $BACKUP_DIR/bigz-hub-mvp-$DATE.db
find $BACKUP_DIR -name "*.db" -mtime +7 -delete
```

---

## Appendix A: Error Codes

| HTTP Status Code | Meaning |
|------------------|---------|
| 200 | Success |
| 201 | Created successfully |
| 400 | Request parameter error |
| 401 | Not logged in |
| 403 | Insufficient permissions |
| 404 | Resource not found |
| 429 | Too many requests |
| 500 | Internal server error |

---

## Appendix B: Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | 3000 | No | Server port |
| `HOST` | 0.0.0.0 | No | Listen address |
| `SESSION_SECRET` | development-secret | **Yes** | Session secret (must be set in production) |

---

## Appendix C: File Structure

```
1.0.1/
├── app.js                    # Application entry point (~2630 lines)
├── package.json              # Project configuration
├── .env                      # Environment variables (do not commit)
│
├── data/                     # Data directory
│   ├── bigz-hub-mvp.db       # SQLite database file
│   └── sessions/             # Session storage
│
├── public/                   # Static resources
│   ├── css/
│   │   └── style.css         # Main stylesheet
│   ├── js/
│   │   ├── app.js            # Main frontend script
│   │   └── editor.js         # Editor script
│   └── uploads/              # User uploaded files
│
├── views/                    # EJS templates
│   ├── partials/
│   │   ├── header.ejs        # Header
│   │   └── footer.ejs        # Footer
│   ├── home.ejs              # Home page
│   ├── login.ejs             # Login page
│   ├── register.ejs           # Registration page
│   ├── forum.ejs             # Post list
│   ├── forum-form.ejs         # Post create/edit page
│   ├── forum-detail.ejs       # Post detail page
│   ├── board.ejs             # Subject board page
│   ├── exams.ejs             # Exam calendar page
│   ├── homeworks.ejs          # Homework dashboard page
│   ├── resources.ejs          # Resource library page
│   ├── search.ejs            # Search results page
│   └── review.ejs            # Review panel page
│
├── tests/                    # Test files
│   └── app.test.js           # Unit tests
│
├── server/config/            # Server configuration
│   └── supercode.ts          # Admin supercode (encrypted)
│
├── docs/                     # Documentation
│   └── openapi.yaml          # API documentation
│
└── db/                       # Database scripts
    └── migrate_2.0.0.sql      # Migration script
```

---

[Back to Top](#bigz-hub-technical-development-documentation-agents)

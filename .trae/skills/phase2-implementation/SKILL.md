---
name: "phase2-implementation"
description: "Implements Phase 2 features: Assignment Submission, Favorites, Dark Mode, and Search Enhancement. Invoke when user asks to implement Phase 2 changes."
---

# Phase 2 Implementation Helper

This skill provides comprehensive implementation guidance for BIGZ Hub Phase 2 features.

## Phase 2 Features Overview

Phase 2 focuses on **functional enhancements**:

| Feature | Description | Priority |
|---------|-------------|----------|
| **F4: Favorites System** | Users can bookmark posts, resources, and assignments | Medium |
| **F5: Schedule/Calendar** | Visual class schedule with weekly view | Medium |
| **F6: Dark Mode** | System-level and manual dark theme toggle | Medium |
| **F7: Post Likes** | Like posts similar to resource likes | Medium |
| **F8: Search Enhancement** | Category filtering, search history, hot searches | Medium |

---

## Feature F4: Favorites System

### Scope Description

Allow users to bookmark items (posts, resources, assignments) to a personal favorites collection for quick access.

### Technical Requirements

#### Database Schema

Add to `initializeDatabase()` in app.js:

```sql
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK(item_type IN ('post', 'resource', 'homework')),
  item_id INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, item_type, item_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
```

#### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/favorites` | List user's favorites with pagination |
| POST | `/api/favorites` | Add item to favorites |
| DELETE | `/api/favorites/:id` | Remove from favorites |
| GET | `/favorites` | Render favorites page |

#### API Request/Response

**POST /api/favorites**
```json
// Request
{ "item_type": "post", "item_id": 123, "note": "复习用" }

// Response
{ "id": 1, "item_type": "post", "item_id": 123, "note": "复习用", "created_at": "..." }
```

**GET /api/favorites?type=post&page=1&limit=20**
```json
{
  "favorites": [
    { "id": 1, "item_type": "post", "item_id": 123, "note": "复习用", "post": { "title": "...", "..." : "..." } },
    { "id": 2, "item_type": "resource", "item_id": 45, "note": "", "resource": { "title": "...", "..." : "..." } }
  ],
  "pagination": { "page": 1, "totalPages": 5, "totalItems": 42 }
}
```

### Implementation Details

1. **Toggle Favorite Button**: Add star/heart icon on posts, resources, and homework cards
2. **Favorites Page**: Grid layout showing all favorited items grouped by type
3. **Quick Add Note**: Modal to add optional note when favoriting
4. **Remove from Favorites**: Confirm before removing

### Testing Process

- [ ] Add post to favorites → appears in /favorites
- [ ] Add resource to favorites → appears in /favorites
- [ ] Add homework to favorites → appears in /favorites
- [ ] Add note when favoriting → note is saved and displayed
- [ ] Remove favorite → item no longer appears
- [ ] Duplicate favorite → returns existing (no duplicate)
- [ ] Unauthenticated user → cannot access favorites

### Expected Results

- Users can bookmark any post, resource, or homework
- Favorites page shows all bookmarks grouped by type
- Optional notes help users remember why they saved

---

## Feature F5: Schedule/Calendar System

### Scope Description

Visual class schedule system where admins/teachers can configure weekly schedules per grade, and students can view their class timetable.

### Technical Requirements

#### Database Schema

Add to `initializeDatabase()`:

```sql
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  semester TEXT NOT NULL DEFAULT '2026-Spring',
  grade TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(semester, grade)
);

CREATE TABLE IF NOT EXISTS schedule_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
  period INTEGER NOT NULL CHECK(period BETWEEN 1 AND 8),
  subject TEXT NOT NULL,
  teacher TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  FOREIGN KEY(schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_items_schedule ON schedule_items(schedule_id);
```

#### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/schedules?grade=G9` | Get schedule for grade |
| POST | `/api/schedules` | Create/update semester schedule (admin) |
| POST | `/api/schedules/:id/items` | Add schedule item (admin) |
| DELETE | `/api/schedules/:id/items/:itemId` | Remove schedule item (admin) |
| GET | `/schedule` | Render schedule page |

#### API Request/Response

**GET /api/schedules?grade=G9**
```json
{
  "schedule": {
    "id": 1,
    "semester": "2026-Spring",
    "grade": "G9"
  },
  "items": [
    { "id": 1, "day_of_week": 1, "period": 1, "subject": "数学", "teacher": "Ms.Wang", "room": "101", "start_time": "08:00", "end_time": "08:50" },
    { "id": 2, "day_of_week": 1, "period": 2, "subject": "英语", "teacher": "Mr.Smith", "room": "102", "start_time": "09:00", "end_time": "09:50" }
  ]
}
```

**POST /api/schedules**
```json
// Request
{
  "semester": "2026-Spring",
  "grade": "G9",
  "items": [
    { "day_of_week": 1, "period": 1, "subject": "数学", "teacher": "Ms.Wang", "room": "101", "start_time": "08:00", "end_time": "08:50" }
  ]
}
```

### Implementation Details

1. **Schedule View**: Weekly grid (Mon-Sat columns, Period rows)
2. **Color Coding**: Each subject gets a color (reuse board colors)
3. **Current Period Highlight**: Show "current class" indicator
4. **Admin Schedule Editor**: Form to add/edit schedule items
5. **Grade Selector**: Dropdown to switch between grades

### Testing Process

- [ ] Admin can create schedule for a grade
- [ ] Admin can add/update/remove schedule items
- [ ] Students can view schedule for their grade
- [ ] Schedule displays correctly in weekly grid
- [ ] Schedule persists across sessions
- [ ] Invalid schedule data is rejected

### Expected Results

- Weekly timetable displays with all classes
- Subject colors match board colors
- Admin can fully manage schedules

---

## Feature F6: Dark Mode

### Scope Description

Implement dark/night theme with system-level auto-detection and manual toggle option.

### Technical Requirements

#### CSS Changes

In `public/css/style.css`, add CSS custom properties:

```css
:root {
  /* Light mode (current) */
  --bg: #f4f7fb;
  --surface: #ffffff;
  --surface-alt: #eef4ff;
  --text: #111827;
  --muted: #64748b;
  --line: #dbe5f1;
  /* ... existing variables ... */
}

[data-theme="dark"] {
  --bg: #0f172a;
  --surface: #1e293b;
  --surface-alt: #334155;
  --text: #f1f5f9;
  --muted: #94a3b8;
  --line: #334155;
  /* Adjust all colors for dark mode */
}
```

#### JavaScript Changes

In `public/js/app.js`, add theme management:

```javascript
const ThemeManager = {
  STORAGE_KEY: 'bigz-hub-theme',

  init() {
    // Check localStorage first, then system preference
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      this.setTheme(saved);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.setTheme('dark');
    }

    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', e => {
        if (!localStorage.getItem(this.STORAGE_KEY)) {
          this.setTheme(e.matches ? 'dark' : 'light');
        }
      });
  },

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(this.STORAGE_KEY, theme);
  },

  toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
  }
};
```

#### Header Modification

Add theme toggle button in `views/partials/header.ejs`:

```html
<button class="theme-toggle" onclick="ThemeManager.toggle()" aria-label="切换主题">
  <span data-theme-icon="light">🌙</span>
  <span data-theme-icon="dark">☀️</span>
</button>
```

### Testing Process

- [ ] Page loads with system dark preference → dark theme applied
- [ ] Toggle button switches theme → persists after refresh
- [ ] Manual preference overrides system preference
- [ ] All pages maintain theme consistently
- [ ] No flash of wrong theme on page load

### Expected Results

- Dark mode available via toggle button
- System preference auto-detected
- Theme persists across sessions

---

## Feature F7: Post Likes

### Scope Description

Allow users to like posts (similar to existing resource likes functionality).

### Technical Requirements

#### Database Change

Add to `initializeDatabase()`:

```sql
ALTER TABLE posts ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN dislike_count INTEGER NOT NULL DEFAULT 0;
```

Or create separate tracking table:

```sql
CREATE TABLE IF NOT EXISTS post_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reaction_type TEXT NOT NULL CHECK(reaction_type IN ('like', 'dislike')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id),
  FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/posts/:id/like` | Toggle like on post |
| GET | `/api/posts?sort=popular` | Get posts sorted by likes |

### Implementation Details

1. **Like Button**: Heart icon on post cards and detail page
2. **Like Count Display**: Show total likes on post
3. **Unlike**: Click again to remove like
4. **Popular Sort**: Sort forum by most liked

### Testing Process

- [ ] Click like → count increases
- [ ] Click again → like removed
- [ ] Unauthenticated user → cannot like
- [ ] Popular sort → correct ordering

---

## Feature F8: Search Enhancement

### Scope Description

Improve search with category filtering, search history, and trending searches.

### Technical Requirements

#### Database Changes

```sql
CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  term TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trending_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL UNIQUE,
  search_count INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=test&type=post` | Search with type filter |
| GET | `/api/search/history` | Get user's search history |
| GET | `/api/search/trending` | Get trending searches |
| DELETE | `/api/search/history/:id` | Remove from history |

#### Query Parameters for Search

| Parameter | Type | Description |
|-----------|------|-------------|
| q | string | Search term |
| type | string | Filter: post, resource, homework, exam, all |
| page | number | Page number |
| limit | number | Results per page (default 20) |

### Implementation Details

1. **Filter Tabs**: All / Posts / Resources / Homework / Exams
2. **Search History**: Dropdown showing recent searches (localStorage)
3. **Trending Searches**: Sidebar showing popular terms
4. **Result Pagination**: Load more / Page numbers
5. **Highlight**: Highlight matching terms in results

### Testing Process

- [ ] Search filters by type correctly
- [ ] Search history saved and displayed
- [ ] Trending searches show popular terms
- [ ] Pagination works correctly
- [ ] Empty results show helpful message

### Expected Results

- Users can filter search results by content type
- Recent searches are remembered
- Trending searches encourage discovery

---

## Cross-Cutting Concerns

### Error Handling

All features should implement:

1. **Validation Errors**: Return 400 with clear error message
2. **Authentication Errors**: Return 401 for unauthenticated requests
3. **Authorization Errors**: Return 403 for unauthorized access
4. **Not Found Errors**: Return 404 for missing resources
5. **Server Errors**: Return 500 with generic message + log details

### Performance Considerations

1. **Database Indexes**: Ensure proper indexes on foreign keys and frequently queried columns
2. **Pagination**: All list endpoints must support pagination (default 20, max 100)
3. **Query Optimization**: Use EXPLAIN QUERY PLAN to verify indexes are used
4. **Caching**: Consider caching schedule data (TTL: 5 minutes)

### Security

1. **Input Sanitization**: Sanitize all user input (use existing DOMPurify)
2. **SQL Injection**: Continue using parameterized queries
3. **XSS Prevention**: Escape HTML in user-generated content
4. **Rate Limiting**: Apply same rate limits as existing chat system

---

## Implementation Order

Recommended order for Phase 2:

1. **F6 Dark Mode** (easiest, highest visibility) → Users immediately see improvement
2. **F7 Post Likes** (reuses existing resource like logic) → Quick win
3. **F4 Favorites System** (new table, moderate complexity)
4. **F8 Search Enhancement** (database + API + view updates)
5. **F5 Schedule System** (most complex, admin features)

---

## Documentation Requirements

For each feature implemented, document:

1. **Feature Name**: Clear feature identifier
2. **Tables Modified**: List all database changes
3. **Routes Added**: List all new endpoints
4. **Views Modified**: List all template changes
5. **Testing Checklist**: Verification steps completed
6. **Known Limitations**: Any constraints or incomplete features
7. **Migration Notes**: How to update existing databases

---

## Rollback Plan

Before implementing Phase 2:

1. **Backup Database**: `cp data/bigz-hub-mvp.db data/bigz-hub-mvp.db.backup-phase2`
2. **Backup Code**: Git commit or copy of app.js and views/
3. **Feature Flags**: Consider adding feature flags to disable new features if issues arise

---

## Potential Challenges

| Challenge | Mitigation |
|-----------|------------|
| Dark mode not covering all elements | Audit all CSS, test on multiple pages |
| Search performance with large dataset | Add indexes, consider full-text search |
| Schedule grid responsive design | Mobile-first approach, horizontal scroll |
| Favorites cleanup on content deletion | CASCADE DELETE handles this, verify |
| Like button race conditions | Use database transactions |

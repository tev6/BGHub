# CJ 模块结构重构规范

## Why

当前 CJ 模块存在以下问题：

1. **学科页面耦合**：每个学科（Physics、Chemistry 等）占用独立路由和页面，扩展性差，未来添加新学科需修改多处代码
2. **单科内容结构复杂**：单个学科页面使用下拉框切换 IC/HW/A 三项，交互繁琐
3. **页面导航不清晰**：缺少统一的 CJ 入口和学科快速切换机制
4. **权限管理分散**：CJ 编辑权限逻辑分散在不同文件中，维护困难

## What Changes

### 1. 统一学科路由结构

**现状**：`/boards/physics`、`/boards/chemistry` 等每个学科独立路由

**改进**：使用 `?subject=physics` 查询参数，一个路由处理所有学科

```
/cj              - CJ 首页，展示所有学科卡片
/cj?subject=physics - 查看/编辑特定学科
/cj/edit?subject=physics - 编辑特定学科
```

### 2. 简化单学科内容编辑

**现状**：每个学科有 IC/HW/A 三个独立 section，通过下拉框切换

**改进**：
- 单页面同时展示 IC/HW/A 三个内容区域
- 无需下拉框切换，一次编辑全部三项
- 移除单 section 的标题字段（仅保留内容编辑）

### 3. CJ 首页重构

**页面结构**：
- 顶部：当前日期 CJ 汇总
- 中间：各学科卡片网格布局（每科一个卡片，显示今日 IC/HW/A 预览）
- 点击卡片 → 进入该学科的 CJ 查看页面

### 4. 学科查看页面重构

**页面结构**：
- 主体：IC/HW/A 三个内容区块同时展示
- 右侧：快速跳转栏（所有学科列表，超长时滚动）
- 右上角：编辑按钮（需权限）

### 5. 统一权限管理

根据 `学生社区信用等级与权限完整说明.md`：

| 等级 | CJ 编辑权限 | 是否需要 AI 审核 |
| ---- | ---------- | --------------- |
| LV0–LV2 | ❌ 不可编辑 | — |
| LV3 | ✅ 可编辑 | ✅ 需 AI 审核 |
| LV4 | ✅ 可编辑 | ❌ 免审 |
| LV5+ | ✅ 可编辑 | ❌ 完全免审 |

### 6. 路由与页面清单

| 路由 | 方法 | 权限 | 说明 |
| ---- | ---- | ---- | ---- |
| `/cj` | GET | 公开 | CJ 首页，所有学科卡片 |
| `/cj?subject=xxx` | GET | 公开（查看）/ LV3+（编辑按钮可见）| 学科详情页 |
| `/cj/edit` | GET | LV3+ | 学科选择编辑页 |
| `/cj/edit?subject=xxx` | GET/POST | LV3+ | 编辑特定学科 |
| `/api/cj` | GET | 公开 | 获取 CJ 数据 API |
| `/api/cj` | PUT | LV3+ | 保存 CJ 内容 API |

## Impact

- **Affected specs**: 学生社区信用等级与权限完整说明
- **Affected code**:
  - `app.js` - 新路由定义
  - `server/routes/boards.js` - 重构路由逻辑
  - `views/board.ejs` → `views/cj/index.ejs` - 新 CJ 首页
  - `views/cj/subject.ejs` - 学科详情页
  - `views/cj/edit.ejs` - 编辑页
  - `views/cj/_section-block.ejs` - IC/HW/A 内容区块组件
  - `public/js/cj-app.js` - CJ 前端逻辑
  - `public/css/style.css` - 相关样式

## Database Schema Changes

### board_sections 表

**现状**：
```sql
CREATE TABLE board_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  section TEXT NOT NULL,  -- 'IC', 'HW', 'A'
  section_date TEXT NOT NULL DEFAULT (date('now')),
  title TEXT NOT NULL,
  title_en TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  updated_by INTEGER,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(board_id, section)
);
```

**问题**：
- `section` 字段存储 'IC'/'HW'/'A' 字符串，与 board 绑定
- UNIQUE 约束是 `(board_id, section)` 不含日期，导致同一天只能有唯一一行

**改进方案**：
由于数据库约束问题，保持现有表结构不变，但代码逻辑改为：
- 按 `board_id + section_date` 查询该日期的完整 CJ
- 三项内容（IC/HW/A）在同一行以 `content_ic`、`content_hw`、`content_a` 或 JSON 格式存储

**替代方案（推荐）**：
保持现有行结构（每行一个 section），但：
- 查询时按 `board_id + section_date` 返回该日期所有 section
- 前端组装显示

## ADDED Requirements

### Requirement: CJ 首页

系统必须提供统一的 CJ 首页，展示所有学科。

#### Scenario: 用户访问 CJ 首页
- **WHEN** 用户访问 `/cj`
- **THEN** 显示所有学科卡片，每张卡片显示该学科今日 IC/HW/A 内容预览

#### Scenario: 用户点击学科卡片
- **WHEN** 用户点击某学科卡片
- **THEN** 跳转至 `/cj?subject={slug}` 显示该学科详情

### Requirement: 学科详情页

系统必须提供单学科 CJ 详情页面。

#### Scenario: 用户查看学科详情
- **WHEN** 用户访问 `/cj?subject=chemistry`
- **THEN** 同时展示 IC/HW/A 三个内容区块，以及右侧快速跳转栏

#### Scenario: 右按钮导航
- **WHEN** 用户在右侧跳转栏点击其他学科
- **THEN** 无刷新切换到对应学科的内容

### Requirement: CJ 编辑功能

只有 LV3+ 用户可以编辑 CJ 内容。

#### Scenario: LV3 用户编辑 CJ
- **WHEN** LV3 用户提交 CJ 编辑
- **THEN** 内容进入 AI 审核流程

#### Scenario: LV4+ 用户编辑 CJ
- **WHEN** LV4+ 用户提交 CJ 编辑
- **THEN** 内容直接发布，无需审核

#### Scenario: LV0-LV2 用户访问编辑页
- **WHEN** LV0-LV2 用户访问 `/cj/edit`
- **THEN** 返回 403 权限不足

### Requirement: 统一 CJ 内容编辑

单页面同时编辑 IC/HW/A 三项内容。

#### Scenario: 用户编辑学科 CJ
- **WHEN** 用户在编辑页同时填写 IC/HW/A 三个文本框并提交
- **THEN** 一次保存三个 section 的内容

## MODIFIED Requirements

### Requirement: needsAIAudit 函数

**现状**：
```javascript
function needsAIAudit(user, type) {
  const level = getUserLevel(user);
  switch (type) {
    case 'cj': return level <= 1;
    // ...
  }
}
```

**改进**：
- LV3 用户编辑 CJ 需要 AI 审核（`level <= 3` 但 `level < 4`）
- LV4+ 用户编辑 CJ 免审

```javascript
function needsAIAudit(user, type) {
  const level = getUserLevel(user);
  switch (type) {
    case 'cj': return level >= 3 && level < 5;  // LV3 需审核，LV4+ 免审
    // ...
  }
}
```

### Requirement: board 路由（移除）

**移除**：`/boards/:slug` 路由

**原因**：CJ 模块将从 boards 模块独立出来

## REMOVED Requirements

### Requirement: boards 路由下的 CJ 页面

**移除原因**：CJ 独立为 `/cj` 路由，不再使用 `/boards/:slug`

**迁移**：
- 原 `/boards/:slug` → 新 `/cj?subject=:slug`
- 原 `/boards/:slug/edit` → 新 `/cj/edit?subject=:slug`

---

## Technical Notes

### 前端路由策略

使用 History API 实现无刷新导航：
- `navigateToSubject(slug)` - 切换学科内容
- `history.pushState()` - 更新 URL 不刷新
- `popstate` 事件 - 浏览器后退/前进支持

### 权限检查点

| 操作 | 检查点 |
| ---- | ------ |
| 查看 CJ 首页 | 无（公开）|
| 查看学科详情 | 无（公开）|
| 显示编辑按钮 | LV3+ |
| 提交 CJ 编辑 | LV3+ |
| 跳过 AI 审核 | LV4+ |
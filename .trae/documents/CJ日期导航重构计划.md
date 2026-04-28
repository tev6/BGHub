# CJ 日期导航重构计划

## 问题分析

当前 CJ 日期导航存在以下问题：
1. 使用 URL query 参数 `?date=` 进行日期传递，导致每次切换日期都刷新页面
2. 左按钮在某些情况下跳转到"前天"而非"昨天"
3. 右按钮在某些情况下无响应（被错误地禁用）

## 实施方案

### 第一步：修改 `views/board.ejs` - 移除 URL 参数依赖

将左/右按钮的 `<a>` 标签改为 `<button>` 元素，添加 `data-current-date` 属性存储当前日期，使用纯前端 JavaScript 处理日期逻辑。

**改动点：**
- 左按钮：`href` 改为 `type="button"` + `onclick` 事件
- 右按钮：添加 `type="button"` + `onclick` 事件
- 添加 `data-date` 属性存储当前显示的日期
- 隐藏字段存储 board slug 供 JavaScript 使用

### 第二步：创建 `public/js/board-date-nav.js` - 前端日期处理

新建 JavaScript 文件实现纯前端日期导航：

**核心功能：**
1. `navigateDate(delta)` - 导航到相对日期（-1 或 +1 天）
2. `formatDateDisplay(dateObj)` - 格式化日期显示（今天/昨天/前天/具体日期）
3. `updateDateDisplay(dateStr)` - 更新页面显示的日期和内容（通过 fetch API 获取新内容）
4. `fetchCJContent(boardSlug, dateStr)` - 获取指定日期的 CJ 内容
5. `updateCJContent(sections)` - 更新页面上的 IC/HW/A 分区内容

**边界处理：**
- 月初：自动跨月（如 1月1日的后一天是 12月31日上年 - 但实际应正确处理月初是上一年月末的问题）
- 月末：自动跨月（如 1月31日的后一天是 2月1日）
- 年末：自动跨年（如 12月31日的后一天是 1月1日次年）

### 第三步：修改后端 `server/routes/boards.js` - 新增 API 端点

新增 `GET /api/boards/:slug/cj` API 端点，返回指定日期的 CJ 内容：

**请求：** `GET /api/boards/:slug/cj?date=2026-01-15`

**响应：**
```json
{
  "sections": {
    "IC": { "title": "...", "content": "...", "updated_at": "..." },
    "HW": { "title": "...", "content": "...", "updated_at": "..." },
    "A": { "title": "...", "content": "...", "updated_at": "..." }
  },
  "dateNav": {
    "prevDate": "2026-01-14",
    "nextDate": "2026-01-16",
    "display": "2026-01-15",
    "isFuture": false
  }
}
```

### 第四步：修改 `app.js` - 注册新 API 路由

在 Express 应用中注册新的 API 路由。

### 第五步：移除日期导航的 URL 参数

修改 `board.ejs` 中的编辑链接：
- 原：`/boards/<%= detail.board.slug %>/edit?date=<%= dateNavData.prevDate %>`
- 改：通过 JavaScript 获取当前日期后跳转

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `views/board.ejs` | 修改 | 按钮改为纯前端处理，移除 href 中的 ?date 参数 |
| `public/js/board-date-nav.js` | 新建 | 前端日期导航 JavaScript 模块 |
| `server/routes/boards.js` | 修改 | 新增 GET /:slug/cj API 端点 |
| `app.js` | 修改 | 注册新 API 路由 |

## 测试要点

1. 验证在今天日期下，左按钮点击显示昨天
2. 验证在昨天日期下，右按钮点击显示今天（今天有内容）
3. 验证右按钮在未来说"未来日期"时应该禁用
4. 验证日期切换无页面刷新
5. 验证 URL 中无 `?date` 参数
6. 验证月初/月末/年末边界情况
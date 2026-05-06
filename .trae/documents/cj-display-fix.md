# CJ 内容显示修复计划

## 问题诊断

数据已写入 `board_sections` 表，主页正常显示，但以下两页面显示"暂未填写"/"待补充"：

### 问题 1: `/cj/subject` 页面 - grade 参数未使用

`/cj/subject?subject=chinese-8&grade=G8&class=FM`

在 [server/routes/cj.js:L135](file:///z:/BGHub/server/routes/cj.js#L135)，subject 路由使用 `req.gradeContext`（来自用户 session/cookie），**忽略了 URL 查询参数 `grade=G8`**。若 `gradeContext` 中的 grade 与 URL 参数不一致，则 `getSectionsForBoard` 中：

1. `isG6G8` 判断错误，可能走 else 分支获取所有班级的数据
2. `subject_grade_permissions` 查询使用错误的 grade
3. `userClass` 虽然正确（来自 `viewingClass`），但 class-specific 查询分支可能未被触发

**修复**：subject 页面应优先使用 `req.query.grade` 构建 gradeContext（如果提供），fallback 到 `req.gradeContext`。

### 问题 2: `/cj/quick` 页面 - 日期可能不一致

`/cj/quick?grade=G8&class=FM`

在 [server/routes/cj.js:L511-L513](file:///z:/BGHub/server/routes/cj.js#L511-L513)，日期计算使用：
```javascript
const today = new Date();
today.setHours(0, 0, 0, 0);
const todayStr = today.toISOString().split('T')[0];
```

而主页 `getBoards`（[server/services/dashboard.js:L19](file:///z:/BGHub/server/services/dashboard.js#L19)）使用 SQLite 的 `date('now', 'localtime')`。

在 UTC+8 时区，若处于 0:00-8:00 时段：
- `toISOString()` 返回前一天的 UTC 日期
- `date('now', 'localtime')` 返回当天的本地日期

这导致 section_date 查询条件可能不匹配。

**修复**：统一使用本地日期计算方式，即 `new Date().toLocaleDateString('zh-CN')` 或手动构建 `YYYY-MM-DD` 字符串。

---

## 实施步骤

### 步骤 1: 创建日期工具函数 `server/utils/date.js`

- 添加 `todayStr()` 函数，使用本地日期格式 `YYYY-MM-DD`（timezone-safe）
- 确保 AJV 路由和 quick 路由使用同一函数

### 步骤 2: 修复 `/cj/subject` 路由

修改 [server/routes/cj.js](file:///z:/BGHub/server/routes/cj.js#L121-L197) 中的 subject GET 路由：

- 读取 `req.query.grade` 和 `req.query.class`
- 如果提供了 grade 参数，构建临时的 `effectiveGradeContext = { grade, class_name }`
- 将 `effectiveGradeContext` 传给 `getSectionsForBoard` 而不是 `req.gradeContext`
- 同时用于权限检查和 UI 显示

### 步骤 3: 修复 `/cj/quick` 路由的日期

修改 [server/routes/cj.js:L511-L513](file:///z:/BGHub/server/routes/cj.js#L511-L513)：

- 使用统一的 `todayStr()` 函数

### 步骤 4: 修复 `getSectionsForBoard` 的日期

修改 [server/routes/cj.js:L8-L9](file:///z:/BGHub/server/routes/cj.js#L8-L9)：

- 使用统一的 `todayStr()` 函数

### 步骤 5: 验证

- 启动服务器
- 访问 `/cj/subject?subject=chinese-8&grade=G8&class=FM` 验证内容已显示
- 访问 `/cj/quick?grade=G8&class=FM` 验证内容已显示
- 访问主页验证依然正常

---

## 影响范围

- `server/utils/date.js` - 添加 `todayStr()` 导出
- `server/routes/cj.js` - 修改 subject GET 路由、quick 路由、getSectionsForBoard

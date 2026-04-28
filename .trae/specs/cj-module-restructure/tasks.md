# CJ 模块重构任务清单

## 任务依赖

- Task 2、3、4、5 可并行
- Task 6、7、8、9 可并行
- Task 10 依赖 Task 6、7、8、9 完成

## 任务列表

### Task 1: 数据库表结构评估与确认
- [x] 1.1 检查 board_sections 表当前结构
- [x] 1.2 确认 section_date 字段是否存在
- [x] 1.3 确定 CJ 内容存储方案（保持每行一个 section 或改为 JSON 合并）

### Task 2: 重构后端路由逻辑
- [x] 2.1 创建 `/cj` 首页路由（GET）
- [x] 2.2 创建 `/cj?subject=xxx` 学科详情路由（GET）
- [x] 2.3 创建 `/cj/edit` 编辑选择页路由（GET, LV3+）
- [x] 2.4 创建 `/cj/edit?subject=xxx` 学科编辑路由（GET/POST, LV3+）
- [x] 2.5 创建 `/api/cj` 数据接口（GET 公开，PUT LV3+）
- [x] 2.6 移除或保留原有 `/boards/:slug` 路由（标记为 Legacy）

### Task 3: 创建 CJ 前端 JavaScript 模块
- [x] 3.1 创建 `public/js/cj-view.js`
- [x] 3.2 实现 `navigateDate(delta)` 无刷新日期切换
- [x] 3.3 实现 `loadContent(subject, date)` 加载内容
- [x] 3.4 实现 `updateDisplay()` 更新页面内容
- [x] 3.5 实现右侧学科跳转栏滚动逻辑

### Task 4: 创建 CJ 视图模板
- [x] 4.1 创建 `views/cj/index.ejs` - CJ 首页（学科卡片网格）
- [x] 4.2 创建 `views/cj/subject.ejs` - 学科详情页（IC/HW/A 同时展示 + 右侧跳转栏）
- [x] 4.3 创建 `views/cj/edit.ejs` - 学科编辑页（三个文本框同时编辑）
- [x] 4.4 创建 `views/cj/select.ejs` - 学科选择页

### Task 5: 更新 needsAIAudit 权限逻辑
- [ ] 5.1 修改 `needsAIAudit('cj')` 逻辑：LV3 需审核，LV4+ 免审
- [ ] 5.2 在路由处理器中添加权限检查

### Task 6: 更新样式文件
- [ ] 6.1 添加 CJ 首页学科卡片网格布局样式
- [ ] 6.2 添加学科详情页右侧跳转栏样式（滚动支持）
- [ ] 6.3 添加 IC/HW/A 三列布局样式（编辑页）
- [ ] 6.4 确保深色模式兼容

### Task 7: 更新 header 导航（如需要）
- [ ] 7.1 确认 CJ 入口是否添加或保持现状

### Task 8: 更新国际化文本
- [ ] 8.1 添加新的 CJ 相关翻译键
- [ ] 8.2 更新 `server/locales/zh.json`
- [ ] 8.3 更新 `server/locales/en.json`

### Task 9: 创建 CJ 数据辅助函数
- [x] 9.1 路由中直接实现数据获取逻辑
- [x] 9.2 路由中直接实现数据保存逻辑
- [x] 9.3 与现有 `getBoardDetail` 函数的区别已明确（CJ 模块独立）

### Task 10: 测试验证
- [ ] 10.1 测试 CJ 首页加载和学科卡片显示
- [ ] 10.2 测试学科详情页内容加载
- [ ] 10.3 测试右侧跳转栏无刷新切换
- [ ] 10.4 测试 LV3/LV4+ 用户编辑权限差异
- [ ] 10.5 测试 AI 审核流程（LV3 用户）
- [ ] 10.6 测试深色模式显示

## 关键技术点

### 数据库查询示例

```javascript
// 获取某日期某学科的所有 section
async function getCJSubjectData(boardSlug, dateStr) {
  const board = await getBoardBySlug(boardSlug);
  const sections = await query.all(`
    SELECT * FROM board_sections
    WHERE board_id = ? AND section_date = ?
    ORDER BY section
  `, [board.id, dateStr || "date('now', 'localtime')"]);
  return sections;
}

// 一次保存三个 section
async function saveCJSubjectData(boardId, dateStr, icContent, hwContent, aContent, userId) {
  const sections = [
    { section: 'IC', content: icContent },
    { section: 'HW', content: hwContent },
    { section: 'A', content: aContent }
  ];

  for (const sec of sections) {
    const existing = await query.get(
      'SELECT id FROM board_sections WHERE board_id = ? AND section = ? AND section_date = ?',
      [boardId, sec.section, dateStr]
    );

    if (existing) {
      await query.run('UPDATE board_sections SET content = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [sec.content, userId, existing.id]);
    } else {
      await query.run('INSERT INTO board_sections (board_id, section, section_date, content, updated_by) VALUES (?, ?, ?, ?, ?)',
        [boardId, sec.section, dateStr, sec.content, userId]);
    }
  }
}
```
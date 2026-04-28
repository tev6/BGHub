# 关于页面系统改进计划

## 任务概述
1. 去除文档类型分类功能
2. 优化关于页面样式（白色卡片容器）
3. 实现 GitHub 风格的 Markdown 渲染样式

---

## 任务 1: 去除文档类型（doc_type）

### 1.1 修改后端 [server/routes/about.js](z:\BGHub\server\routes\about.js)
- 删除 `VALID_DOC_TYPES` 常量
- 简化 `getAboutPages()` 函数，移除 `docType` 参数和查询条件
- 简化 `router.get('/')` 路由：
  - 移除 `docTypes` 分组逻辑
  - 直接返回按 `sort_order` 和 `created_at` 排序的页面列表
- 简化 `router.post('/')` 创建逻辑：
  - 移除 `doc_type` 字段处理
  - SQL INSERT 移除 `doc_type` 字段
- 简化 `router.post('/:slug/edit')` 更新逻辑：
  - 移除 `doc_type` 字段处理
  - SQL UPDATE 移除 `doc_type` 字段

### 1.2 修改前端列表页 [views/about/index.ejs](z:\BGHub\views\about\index.ejs)
- 移除 `groupedPages` 和 `docTypeNames` 使用
- 简化循环，直接遍历 `pages` 数组
- 移除 `.about-group` 分组容器，改用扁平的 `.about-item` 列表
- 页面列表样式调整为简单的卡片列表

### 1.3 修改前端表单 [views/about/form.ejs](z:\BGHub\views\about\form.ejs)
- 移除 `doc_type` 下拉选择框
- 移除相关翻译 key 引用

### 1.4 简化数据库（保持向后兼容）
- `about_pages` 表保留 `doc_type` 列但不使用
- 不删除列，避免现有数据丢失

### 1.5 更新翻译文件
- [server/locales/zh.json](z:\BGHub\server\locales\zh.json) - 移除 `about.docType*` 相关翻译
- [server/locales/en.json](z:\BGHub\server\locales\en.json) - 同上

---

## 任务 2: 优化关于页面详情样式

### 2.1 修改 [views/about/detail.ejs](z:\BGHub\views\about\detail.ejs)
- 将 `.markdown-body` 内容包裹在 `.card` 容器中
- 确保内容区域有白色背景（浅色模式）
- 添加适当的 `padding` 和 `border-radius`

```ejs
<div class="card page-detail-card">
  <div class="page-header">...</div>
  <div class="markdown-body page-content">...</div>
</div>
```

### 2.2 添加 CSS 样式
在 [public/css/style.css](z:\BGHub\public\css\style.css) 添加：

```css
.page-detail-card {
  background: var(--surface);
  padding: 2rem;
  border-radius: 8px;
  border: 1px solid var(--line);
}
```

---

## 任务 3: GitHub 风格 Markdown 渲染

项目已使用 `marked` 库和 `dompurify`，无需下载额外组件。

### 3.1 添加 GitHub 风格 CSS
在 [public/css/style.css](z:\BGHub\public\css\style.css) 中替换现有的 `.markdown-body` 样式为完整的 GitHub 风格：

```css
.markdown-body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  word-wrap: break-word;
  color: #24292e;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
  border-bottom: 1px solid #eaecef;
  padding-bottom: 8px;
}

.markdown-body h1 { font-size: 2em; }
.markdown-body h2 { font-size: 1.5em; }
.markdown-body h3 { font-size: 1.25em; }

.markdown-body p {
  margin-top: 0;
  margin-bottom: 16px;
}

.markdown-body code {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  background-color: rgba(27,31,35,0.05);
  border-radius: 3px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}

.markdown-body pre {
  padding: 16px;
  overflow: auto;
  font-size: 85%;
  line-height: 1.45;
  background-color: #f6f8fa;
  border-radius: 3px;
}

.markdown-body pre code {
  padding: 0;
  margin: 0;
  background-color: transparent;
  border: 0;
}

.markdown-body blockquote {
  padding: 0 1em;
  color: #6a737d;
  border-left: 0.25em solid #dfe2e5;
  margin: 0 0 16px 0;
}

.markdown-body ul,
.markdown-body ol {
  padding-left: 2em;
  margin-top: 0;
  margin-bottom: 16px;
}

.markdown-body table {
  border-spacing: 0;
  border-collapse: collapse;
  margin-bottom: 16px;
  width: 100%;
}

.markdown-body table th,
.markdown-body table td {
  padding: 6px 13px;
  border: 1px solid #dfe2e5;
}

.markdown-body table th {
  font-weight: 600;
  background-color: #f6f8fa;
}

.markdown-body table tr:nth-child(2n) {
  background-color: #f6f8fa;
}

.markdown-body a {
  color: #0366d6;
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body img {
  max-width: 100%;
  box-sizing: border-box;
}

.markdown-body hr {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  background-color: #e1e4e8;
  border: 0;
}
```

### 3.2 深色模式适配
添加 `[data-theme="dark"]` 版本的 markdown-body 样式，使用深色配色方案。

---

## 实施顺序

1. 修改 `about.js` 路由逻辑
2. 更新 `about/index.ejs` 列表页
3. 更新 `about/form.ejs` 表单
4. 更新 `about/detail.ejs` 详情页
5. 添加 CSS 样式
6. 更新翻译文件
7. 测试验证

---

## 文件修改清单

| 文件 | 操作 |
|------|------|
| `server/routes/about.js` | 修改 |
| `views/about/index.ejs` | 修改 |
| `views/about/form.ejs` | 修改 |
| `views/about/detail.ejs` | 修改 |
| `public/css/style.css` | 修改 |
| `server/locales/zh.json` | 修改 |
| `server/locales/en.json` | 修改 |

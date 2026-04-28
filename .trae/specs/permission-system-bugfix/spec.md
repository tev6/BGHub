# 权限系统修复与优化第四阶段规范

## 问题描述

### 问题 1：聊天消息删除按钮显示 "undefined"
**现象**：LV2 用户发布聊天消息后，消息右侧显示 "undefined" 而不是删除按钮图标，刷新页面后恢复正常。

**原因**：前端 JavaScript 在动态添加消息时，删除按钮的 HTML 代码有错误。

### 问题 2：访问不存在的文章显示服务器错误
**错误信息**：`Failed to lookup view "error" in views directory`

**位置**：`server/routes/forum.js:119` 的 `respondError` 函数

**需求**：创建独立的错误页面，显示友好的提示信息：
- 中文："抱歉，该文章不存在。如果你正在寻找某文章，此文章可能已被删除……"
- 英文："Sorry, this article does not exist. If you are looking for an article, it may have been deleted..."

### 问题 3：中英文切换显示不一致
**现象**：
- 刷新页面后显示旧标签（如"课件库"、"互助广场"）
- 切换到英文再切换回中文后显示新标签（如"文章"、"审核"）

**原因**：存在两套中文翻译系统，导致显示不一致。应该只有一套中文系统和一套英文系统。

## 修改内容

### 1. 修复聊天消息删除按钮
修改 `public/js/app.js` 中的聊天消息动态添加逻辑，确保删除按钮正确显示。

### 2. 创建错误页面
- 创建 `views/error.ejs` 模板
- 修改 `respondError` 函数使用新模板
- 添加中英文翻译

### 3. 修复中英文切换问题
- 检查 `server/locales/zh.json` 和 `server/locales/en.json`
- 确保只有一套翻译系统
- 检查前端 i18n 切换逻辑

## 影响范围

### 受影响的文件
- `public/js/app.js` - 聊天消息动态添加
- `views/error.ejs` - 新建错误页面
- `server/routes/forum.js` - respondError 函数
- `server/locales/zh.json` - 中文翻译
- `server/locales/en.json` - 英文翻译
- `public/js/app.js` 或相关 i18n 代码 - 语言切换逻辑

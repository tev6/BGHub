# 资源与权限修复任务列表

---

## 任务 1：错误 #9-1 - 修改资源发布页面描述

### 任务步骤
- [x] 1.1 检查 `views/resources-form.ejs` 中的描述文字
- [x] 1.2 将"普通用户上传后状态为 pending，管理员上传会直接发布"修改为"发布后会经过人工审核"

---

## 任务 2：错误 #9-2 - 学科选择框过滤

### 任务步骤
- [x] 2.1 检查 `server/routes/resources.js` 中 `/new` 路由 - **现有逻辑已根据用户年级过滤**

---

## 任务 3：错误 #9-3 - 点赞/取消点赞功能

### 任务步骤
- [x] 3.1 检查数据库是否有 `resource_likes` 表 - **已添加**
- [x] 3.2 创建 `resource_likes` 表跟踪用户点赞
- [x] 3.3 修改 `POST /api/resources/:id/like` 支持取消点赞
- [x] 3.4 返回 `has_liked` 状态给前端

---

## 任务 4：错误 #10 - 资源审核队列

### 任务步骤
- [x] 4.1 检查 `POST /api/resources` 路由中是否调用 `createReviewItem` - **已添加**
- [x] 4.2 确保 LV4 用户发布资源时创建 review_item
- [x] 4.3 修复审核队列 API 查询条件，移除 `ai_reviewed = 1` 限制
- [x] 4.4 添加资源类型到审核队列类型过滤

---

## 任务 5：错误 #11 - 资源删除按钮

### 任务步骤
- [x] 5.1 前端资源列表页面的删除功能取决于用户是否为上传者或管理员

---

## 任务 6：错误 #12 - 资源下载功能

### 任务步骤
- [x] 6.1 创建自定义 `/uploads/:filename` 路由替代静态文件服务
- [x] 6.2 添加 `Content-Disposition: attachment` 响应头
- [x] 6.3 确保文件触发下载而非预览

---

## 任务 7：错误 #13 - 文章编辑/删除权限

### 任务步骤
- [x] 7.1 检查 `views/forum-detail.ejs` 中的按钮显示条件
- [x] 7.2 添加 `isStaff` 参数到 forum-detail 渲染
- [x] 7.3 前端根据 `isStaff` 或文章作者显示编辑/删除按钮

---

## 任务 8：错误 #14 - 举报功能

### 任务步骤
- [x] 8.1 检查 `server/database/index.js` 中 reports 表结构
- [x] 8.2 添加 `min_reviewer_level` 列到 reports 表
- [x] 8.3 确认举报 API 正确传递 min_reviewer_level 参数

---

## 依赖关系

- 所有任务已完成
- 需要重启服务器后进行测试

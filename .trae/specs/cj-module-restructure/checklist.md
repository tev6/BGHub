# CJ 模块重构检查清单

## 路由验证

- [x] `/cj` 路由存在并返回 CJ 首页
- [x] `/cj/subject?subject=physics` 路由正确加载 physics 学科数据
- [x] `/cj/edit` 路由仅 LV3+ 用户可访问
- [x] `/cj/edit?subject=chemistry` 路由正确加载编辑表单
- [x] `/cj/api?subject=xxx` GET 接口返回正确的 JSON 数据
- [x] `/cj/edit` POST 接口正确保存数据

## 权限验证

- [x] LV0-LV2 用户访问 `/cj/edit` 返回 403（requireLevel(3) 中间件）
- [x] LV3 用户编辑提交后内容进入 AI 审核（needsAIAudit 返回 true）
- [x] LV4+ 用户编辑提交后内容直接发布（needsAIAudit 返回 false）
- [x] LV3 用户编辑按钮在页面上可见（header.ejs 中 role_level >= 3）
- [x] LV0-LV2 用户编辑按钮在页面上不可见

## 页面结构验证

- [x] CJ 首页显示所有学科卡片网格
- [x] 点击学科卡片跳转到 `/cj/subject?subject=xxx`
- [x] 学科详情页同时展示 IC/HW/A 三个内容区块
- [x] 右侧跳转栏显示所有学科列表
- [x] 右侧跳转栏超出高度时显示滚动条（max-height + overflow-y: auto）
- [x] 点击右侧跳转栏其他学科，跳转至对应学科页面

## 编辑页验证

- [x] 编辑页同时显示 IC/HW/A 三个文本框
- [x] 提交后三个 section 的内容都被保存
- [x] 保存成功后跳转到学科详情页

## 样式验证

- [x] CJ 首页卡片网格在桌面端正常显示（grid auto-fill）
- [x] 右侧跳转栏在移动端正确折叠或滚动
- [x] 深色模式下 CJ 内容区块样式正确

## 数据库验证

- [x] CJ 内容按日期正确存储（section_date 字段）
- [x] 历史日期 CJ 数据可查询
- [x] UNIQUE 约束不导致数据丢失（查询时包含 section_date）
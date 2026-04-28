# Tasks

- [x] Task 1: 更新后端数据查询逻辑
  - [x] SubTask 1.1: 修改 `getBoards` 函数，为 G6-G8 未共享学科添加班级后缀
  - [x] SubTask 1.2: 修改 `getSectionsForBoard` 函数，支持 `showAllClasses` 参数
  - [x] SubTask 1.3: 添加获取班级列表的 API 端点

- [x] Task 2: 更新主页 CJ 模块
  - [x] SubTask 2.1: 添加"显示其他班"按钮（仅 G6-G8 用户可见）
  - [x] SubTask 2.2: 实现班级切换的前端逻辑
  - [x] SubTask 2.3: 更新学科卡片显示班级后缀名称

- [x] Task 3: 更新 CJ 首页 (`/cj`)
  - [x] SubTask 3.1: 添加班级切换按钮组
  - [x] SubTask 3.2: 实现显示所有班级/仅本班的切换逻辑
  - [x] SubTask 3.3: 更新学科卡片显示

- [x] Task 4: 更新学科详情页 (`/cj/subject`)
  - [x] SubTask 4.1: 添加班级切换按钮组
  - [x] SubTask 4.2: 支持 URL 参数 `?class=A` 指定班级
  - [x] SubTask 4.3: 更新 CJ 内容显示逻辑

- [x] Task 5: 更新编辑页面 (`/cj/edit`)
  - [x] SubTask 5.1: 确保只能编辑自己班级的内容
  - [x] SubTask 5.2: 显示当前编辑的班级信息

- [x] Task 6: 添加国际化支持
  - [x] SubTask 6.1: 添加中文翻译 `zh.json`
  - [x] SubTask 6.2: 添加英文翻译 `en.json`

- [x] Task 7: 添加 CSS 样式
  - [x] SubTask 7.1: 添加班级切换按钮样式
  - [x] SubTask 7.2: 添加班级标签样式

# Task Dependencies

- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 1]
- [Task 5] depends on [Task 1]
- [Task 6] can run in parallel with other tasks
- [Task 7] can run in parallel with other tasks

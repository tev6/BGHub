# BIGZ Hub 贝赛思校园学习助手

[English](README-en.md) | 中文

---

## 项目简介

BIGZ Hub 是一个面向广州贝赛思国际学校学生的校园学习助手平台。本项目旨在为 G6-G12 年级的学生提供一个集考试日历、作业管理、课件共享和同伴互助于一体的综合学习平台。

### 核心功能

- **📅 考试日历**：集中展示各学科考试信息，支持按学科、年级、类型筛选，提供考试倒计时功能
- **📝 作业看板**：实时跟踪作业截止时间，支持个人完成状态切换，再也不会错过任何作业
- **📚 课件库**：集中管理学习资料，支持文件上传和外部链接，课件分类清晰易查找
- **💬 互助广场**：同学之间互相帮助的问答平台，支持提问、回答、标记最佳答案
- **🏫 学科板块**：按学科（数学、英语、物理、化学等）组织内容，每个板块包含课程内容、作业和公告三部分
- **🔍 全局搜索**：一键搜索帖子、资源、考试、作业等全站内容

### 技术特色

- 基于 Node.js + Express 5 构建
- 使用 EJS 模板引擎渲染页面
- SQLite 数据库存储数据，本地化部署简单快捷
- RESTful API 设计，支持前后端分离扩展
- 会话式用户认证，密码安全加密存储

---

## 系统要求

- **Node.js**：v18.0.0 或更高版本
- **npm**：v9.0.0 或更高版本
- **操作系统**：Windows、macOS、Linux 均可运行

---

## 安装指南

### 第一步：克隆项目

```bash
git clone <repository-url>
cd BGHub/1.0.1
```

### 第二步：安装依赖

```bash
npm install
```

### 第三步：配置环境变量（可选）

在项目根目录创建 `.env` 文件：

```env
PORT=3000
HOST=0.0.0.0
SESSION_SECRET=your-secure-session-secret-here
```

> **注意**：`SESSION_SECRET` 在生产环境中必须设置为一个复杂的随机字符串。

### 第四步：启动服务

```bash
npm start
```

### 第五步：访问应用

打开浏览器访问：**http://localhost:3000**

---

## 快速开始

### 首次使用

1. 访问应用后，点击右上角「注册」按钮
2. 使用学校邮箱（@basischina.com）或 Gmail 邮箱注册
3. 选择您所在的年级（G6-G12）
4. 设置密码（至少8位）
5. 注册成功后自动登录

### 首个管理员账号

- **普通注册**：第一个注册的账号将自动成为管理员（LV4）
- **隐藏码注册**：如果已知管理员隐藏码（supercode），注册时填写可立即获得最高管理员权限（LV6）

### 日常使用

#### 浏览首页

登录后进入首页，您可以：
- 左侧查看同学发布的最新帖子和笔记
- 中间浏览各学科板块的课程内容
- 右侧参与班级聊天和查看最新资源

#### 发布帖子

1. 进入「互助广场」
2. 点击「发布帖子」
3. 选择学科板块和帖子类型（提问/笔记/分享）
4. 填写标题和正文（支持 Markdown）
5. 选择是否匿名发布

#### 管理作业

1. 进入「作业看板」
2. 查看各学科作业及截止时间
3. 点击作业旁边的按钮切换完成状态
4. 可按学科或完成状态筛选

#### 上传资源

1. 进入「课件库」
2. 点击「上传资源」
3. 填写资源标题、描述、任课老师
4. 上传本地文件或填写外部链接
5. 普通用户上传需要审核，管理员上传直接通过

---

## 功能详解

### 用户角色与权限

| 角色 | 等级 | 权限说明 |
|------|------|----------|
| 学生 (student) | LV0-LV2 | 浏览、发帖、评论、参与讨论 |
| moderator | LV3-LV4 | 审核内容、管理帖子、维护板块 |
| 管理员 (admin) | LV5-LV6 | 全站管理、用户管理、信用调整 |

### 积分系统

用户通过以下行为获得积分：
- 每日登录：+10 积分
- 内容审核通过：+3~5 积分（根据审核员等级）

积分与用户等级挂钩，等级越高可获得更多权限。

### 学科板块

平台包含以下学科板块：

| 板块 | 描述 | 颜色标识 |
|------|------|----------|
| 数学 | AP 微积分、代数、统计与数学笔记 | #5b7cfa |
| 英语 | 文学阅读、写作任务与课堂资料 | #f97316 |
| 物理 | 实验、习题与考试提醒 | #06b6d4 |
| 化学 | 公式、实验安全与课堂安排 | #10b981 |
| 生物 | 章节重点、实验作业与资料整理 | #84cc16 |
| 历史 | 阅读任务、讨论题与考试节点 | #a855f7 |
| 经济 | 案例分析、作业与课堂公告 | #ec4899 |
| 计算机 | 编程任务、实验要求与资源分享 | #0f172a |
| 其他 | 跨学科内容与通用学习资源 | #64748b |

### CJ 结构

每个学科板块采用 CJ（Class Journal）三段式结构：
- **IC (Instruction Content)**：课程内容
- **HW (Homework)**：课程作业
- **A (Announcement)**：公告

---

## 常见问题

### Q: 忘记了密码怎么办？

目前版本暂未提供密码重置功能。建议联系管理员为您重置密码。

### Q: 上传的资源在哪里查看？

普通用户上传的资源需要经过审核，审核通过后可在「课件库」中查看。管理员上传的资源直接生效。

### Q: 如何成为审核员？

用户等级达到 LV3 以上（积分 ≥300）将自动获得审核权限。

### Q: 帖子为什么被删除了？

帖子可能因包含敏感内容或违反社区规范被管理员删除。如有疑问，请联系管理员。

### Q: 匿名发帖能看到是谁发的吗？

选择匿名发帖后，您的昵称将显示为「匿名用户」，但管理员仍可查看真实发布者。

### Q: 如何联系管理员？

您可以通过邮件或其他学校官方渠道联系管理员。

---

## 项目结构

```
1.0.1/
├── app.js              # 应用主入口
├── package.json        # 项目配置
├── data/               # 数据存储
│   ├── bigz-hub-mvp.db # SQLite 数据库
│   └── sessions/       # 会话存储
├── public/              # 静态资源
│   ├── css/            # 样式文件
│   ├── js/             # 前端脚本
│   └── uploads/        # 上传文件
├── views/               # EJS 模板
│   ├── partials/       # 页眉页脚等公共组件
│   ├── home.ejs        # 首页
│   ├── forum*.ejs      # 论坛相关页面
│   ├── board.ejs      # 学科板块页面
│   ├── exams.ejs       # 考试日历页面
│   ├── homeworks.ejs   # 作业看板页面
│   └── resources.ejs   # 课件库页面
├── tests/              # 测试文件
│   └── app.test.js     # 单元测试
└── server/
    └── config/         # 服务器配置
```

---

## API 接口

平台提供完整的 RESTful API，支持前后端分离开发。

### 认证接口

| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/auth/register` | POST | 用户注册 |
| `/api/auth/login` | POST | 用户登录 |
| `/api/auth/logout` | POST | 用户登出 |

### 数据接口

| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/dashboard` | GET | 获取仪表盘数据 |
| `/api/boards` | GET | 获取所有学科板块 |
| `/api/forum/posts` | GET/POST | 获取/创建帖子 |
| `/api/exams` | GET/POST | 获取/创建考试 |
| `/api/homeworks` | GET/POST | 获取/创建作业 |
| `/api/resources` | GET/POST | 获取/上传资源 |
| `/api/search` | GET | 搜索全站内容 |

详细 API 文档请参考 [docs/openapi.yaml](1.0.1/docs/openapi.yaml)。

---

## 部署指南

### 使用 systemd（Linux）

创建服务文件 `/etc/systemd/system/bigz-hub.service`：

```ini
[Unit]
Description=BIGZ Hub Campus Learning Assistant
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/BGHub/1.0.1
ExecStart=/usr/bin/node app.js
Restart=on-failure
Environment=PORT=3000 HOST=0.0.0.0

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable bigz-hub
sudo systemctl start bigz-hub
```

### 使用 PM2

```bash
npm install -g pm2
pm2 start app.js --name "bigz-hub"
pm2 save
pm2 startup
```

---

## 开发指南

### 运行测试

```bash
npm test
```

### 添加新功能

1. 在 `app.js` 中添加路由和处理逻辑
2. 在 `views/` 中创建或修改 EJS 模板
3. 在 `public/css/` 或 `public/js/` 中添加样式和脚本
4. 在 `tests/` 中添加相应的测试用例

---

## 许可证

本项目采用 ISC 许可证。

---

## 联系方式

- 项目维护者：BIGZ Hub Team
- 学校：广州贝赛思国际学校

---

[返回顶部](#bigz-hub-贝赛思校园学习助手)

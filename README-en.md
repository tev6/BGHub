# BIGZ Hub Campus Learning Assistant

[中文](README.md) | English

---

## Project Overview

BIGZ Hub is a campus learning assistant platform designed for students at Guangzhou BASIS International School. This project aims to provide G6-G12 grade students with a comprehensive learning platform that integrates exam calendars, homework management, resource sharing, and peer-to-peer collaboration.

### Core Features

- **📅 Exam Calendar**: Centralized display of exam information across all subjects, with filtering by subject, grade, and exam type, plus countdown functionality
- **📝 Homework Dashboard**: Real-time tracking of homework deadlines with personal completion status toggling
- **📚 Resource Library**: Centralized management of learning materials with file upload and external link support, clearly categorized for easy searching
- **💬 Community Forum**: Q&A platform for peer-to-peer support with question posting, answers, and best answer marking
- **🏫 Subject Boards**: Content organized by subject (Math, English, Physics, Chemistry, etc.), each board contains course content, homework, and announcements in three sections
- **🔔 Real-time Notifications**: WebSocket-driven instant notification delivery for important reminders
- **💭 Real-time Chat**: Class chat room with instant messaging to enhance communication between classmates
- **🔍 Global Search**: One-click search across posts, resources, exams, homework, and all site content
- **🛡️ Content Moderation**: AI-assisted content moderation to maintain healthy community order

### Technical Highlights

- Built on Node.js + Express 5 with async/await support
- EJS template engine for page rendering
- SQLite database for data storage, easy local deployment
- WebSocket (ws) for real-time communication
- RESTful API design supporting frontend-backend separation
- Session-based user authentication with bcryptjs password hashing
- Markdown content support with DOMPurify XSS protection
- ESLint code style enforcement
- AI content moderation (Kouri API)
- Email service integration (Resend API)

---

## System Requirements

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Operating System**: Windows, macOS, Linux

---

## Installation Guide

### Step 1: Clone the Project

```bash
git clone <repository-url>
cd BGHub
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables (Optional)

Create a `.env` file in the project root:

```env
PORT=3000
HOST=0.0.0.0
SESSION_SECRET=your-secure-session-secret-here
EMAIL_FROM=noreply@bghub.com
RESEND_API_KEY=re_xxxxxxxxx
KOURI_API_KEY=your-kouri-api-key
KOURI_API_BASE_URL=https://api.kourichat.com/v1
```

> **Note**: `SESSION_SECRET` must be set to a complex random string in production environments. `RESEND_API_KEY` is for email sending functionality and is optional.

### Step 4: Initialize Database

The database is automatically initialized on first run, creating all required tables and seed data.

### Step 5: Start the Server

```bash
npm start
```

### Step 6: Access the Application

Open your browser and visit: **http://localhost:3000**

---

## Quick Start

### First-Time Use

1. After accessing the application, click the "Register" button in the top right
2. Register using your school email (@basischina.com) or Gmail
3. Select your grade level (G6-G12)
4. G6-G8 students need to select their class (A, B, C, etc.)
5. Set your password (minimum 8 characters)
6. Auto-login after successful registration

### First Admin Account

- **Regular Registration**: The first registered account automatically becomes admin (LV4)
- **Supercode Registration**: If you know the admin supercode, filling it during registration grants immediate highest admin privileges (LV6)

### Daily Usage

#### Browsing the Home Page

After logging in, the home page shows:
- Dashboard statistics (credits, level, pending homework, etc.)
- Left: Subject boards with course content (CJ module)
- Center: Latest posts and notes from classmates
- Right: Class chat and latest resources

#### Posting

1. Go to "Community Forum"
2. Click "New Post"
3. Select subject board and post type (Question/Note/Share)
4. Fill in title and content (Markdown supported)
5. Choose whether to post anonymously

#### Managing Homework

1. Go to "Homework Dashboard"
2. View homework and deadlines for each subject
3. Click the button next to homework to toggle completion status
4. Filter by subject or completion status

#### Uploading Resources

1. Go to "Resource Library"
2. Click "Upload Resource"
3. Fill in resource title, description, and teacher name
4. Upload a local file or provide an external link
5. Regular user uploads require approval; admin uploads are directly approved

---

## Feature Details

### User Roles and Permissions

| Role | Level | Permissions |
|------|-------|-------------|
| Student | LV0-LV2 | Browse, post, comment, participate in discussions |
| Moderator | LV3-LV4 | Review content, manage posts, maintain boards |
| Admin | LV5-LV6 | Full site management, user management, credit adjustment |

### Credit System

Users earn credits through:
- Daily login: +10 credits
- Content approved: +3~5 credits (based on reviewer level)

Credits are capped at 1000 and tied to user levels; higher levels grant more permissions.

### Subject Boards

The platform includes the following subject boards:

| Board | Description | Color Code |
|-------|-------------|------------|
| Mathematics | AP Calculus, Algebra, Statistics notes | #5b7cfa |
| English | Literature reading, writing tasks | #f97316 |
| Physics | Experiments, exercises, exam reminders | #06b6d4 |
| Chemistry | Formulas, lab safety, class schedules | #10b981 |
| Biology | Chapter highlights, lab assignments | #84cc16 |
| History | Reading tasks, discussion questions | #a855f7 |
| Economics | Case studies, homework, announcements | #ec4899 |
| Computer Science | Programming tasks, lab requirements | #0f172a |
| Other | Cross-subject content and general resources | #64748b |

### CJ Structure

Each subject board uses a CJ (Class Journal) three-section structure:
- **IC (Instruction Content)**: Course content
- **HW (Homework)**: Course homework
- **A (Announcement)**: Announcements

### Content Moderation

Content posted by LV0-LV1 users requires review before being displayed:
- Content from LV2+ users is automatically approved
- AI-assisted moderation detects sensitive words and inappropriate content
- Review queue is managed by LV3+ users

---

## Project Structure

```
BGHub/
├── app.js                 # Application entry point
├── package.json           # Project configuration
├── .env                   # Environment variables (do not commit)
├── .eslintrc.json          # ESLint configuration
│
├── data/                  # Data storage
│   └── bigz-hub-mvp.db    # SQLite database
│
├── public/                # Static resources
│   ├── css/              # Stylesheets
│   ├── js/               # Frontend scripts
│   ├── images/           # Image assets
│   └── uploads/          # Uploaded files
│
├── views/                 # EJS templates
│   ├── partials/         # Header, footer, and shared components
│   ├── admin/            # Admin backend templates
│   ├── cj/               # CJ module templates
│   ├── home.ejs          # Home page
│   ├── forum*.ejs        # Forum-related pages
│   ├── board*.ejs        # Subject board pages
│   ├── exams.ejs         # Exam calendar page
│   ├── homeworks.ejs     # Homework dashboard page
│   ├── resources*.ejs    # Resource library pages
│   ├── chat.ejs          # Real-time chat page
│   ├── notifications.ejs # Notifications page
│   └── messages.ejs      # Messages page
│
├── server/                # Backend core code
│   ├── config/           # Application configuration
│   │   └── supercode.js # Admin verification code
│   ├── database/         # Database module
│   │   └── index.js     # Database initialization
│   ├── locales/          # i18n translations
│   │   ├── zh.json       # Chinese translations
│   │   └── en.json      # English translations
│   ├── middleware/        # Middleware
│   │   ├── auth.js       # Authentication middleware
│   │   └── locale.js     # i18n middleware
│   ├── routes/           # Route modules
│   │   ├── api/          # REST API
│   │   ├── auth.js       # Auth routes
│   │   ├── forum.js      # Forum routes
│   │   ├── boards.js     # Subject board routes
│   │   ├── cj.js         # CJ module routes
│   │   ├── homeworks.js  # Homework routes
│   │   ├── resources.js  # Resource routes
│   │   ├── chat.js       # Chat routes
│   │   ├── search.js     # Search routes
│   │   └── admin.js      # Admin backend routes
│   ├── services/         # Business service layer
│   │   ├── credit.js     # Credit service
│   │   ├── moderation.js # Content moderation
│   │   └── notification.js # Notification service
│   └── utils/            # Utility functions
│       ├── slugify.js    # URL-friendly strings
│       ├── date.js       # Date handling
│       ├── markdown.js   # Markdown rendering
│       └── sanitize.js   # HTML sanitization
│
├── components/            # Vue components (Storybook)
│   └── *.vue             # Various components
│
├── stories/               # Storybook story files
│
├── tests/                 # Test files
│   └── *.test.js         # Unit tests
│
├── db/                    # Database scripts
│   ├── migrations/       # Database migrations
│   └── *.sql             # Migration scripts
│
├── docs/                  # Documentation
│   ├── openapi.yaml     # OpenAPI specification
│   └── *.md             # Technical documentation
│
├── deploy.py              # Code deployment script
├── sync_db.py             # Database sync script
└── migrate.js             # Database migration script
```

---

## Command Line Tools

### Code Deployment (deploy.py)

Package and upload local code to server:

```bash
# Small update (preserve existing data)
python deploy.py -h your-server.com -p /root/mywebsite/BGHub

# Full reset (replace all files)
python deploy.py -h your-server.com -p /root/mywebsite/BGHub --mode full

# Skip confirmation, deploy directly
python deploy.py -h your-server.com -p /root/mywebsite/BGHub --yes
```

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `-h, --host` | Server address | Required |
| `-u, --user` | Server username | root |
| `-p, --path` | Server path | /root/mywebsite/BGHub |
| `-y, --yes` | Skip confirmation | false |
| `--mode` | Deployment mode (small/full) | small |

### Database Sync (sync_db.py)

Download database from server to local:

```bash
# Download server database to local
python sync_db.py -h your-server.com

# Specify server path
python sync_db.py -h your-server.com -p /root/mywebsite/BGHub

# Sync both database and uploads directory
python sync_db.py -h your-server.com --uploads

# Sync only uploads directory
python sync_db.py -h your-server.com --uploads-only
```

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `-h, --host` | Server address | Required |
| `-u, --user` | Server username | root |
| `-p, --path` | Server path | /root/mywebsite/BGHub |
| `-y, --yes` | Skip confirmation | false |
| `--no-backup` | Skip local database backup | false |
| `--uploads` | Sync uploads directory | false |
| `--uploads-only` | Sync only uploads directory | false |

---

## API Reference

The platform provides a complete RESTful API supporting frontend-backend separation development.

### Authentication APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | User registration |
| `/api/auth/login` | POST | User login |
| `/api/auth/logout` | POST | User logout |

### Data APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dashboard` | GET | Get dashboard data |
| `/api/boards` | GET | Get all subject boards |
| `/api/forum/posts` | GET/POST | Get/create posts |
| `/api/forum/posts/:id` | GET/PUT/DELETE | Get/edit/delete post |
| `/api/forum/posts/:id/comments` | POST | Add comment |
| `/api/exams` | GET/POST | Get/create exams |
| `/api/homeworks` | GET/POST | Get/create homework |
| `/api/resources` | GET/POST | Get/upload resources |
| `/api/search` | GET | Search all site content |
| `/api/notifications` | GET | Get notification list |
| `/api/notifications/unread-count` | GET | Get unread count |
| `/api/notifications/:id/read` | POST | Mark as read |
| `/api/chat/messages` | GET/POST | Get/send chat messages |

For detailed API documentation, see [docs/openapi.yaml](docs/openapi.yaml).

---

## Deployment Guide

### Using systemd (Linux)

Create the service file `/etc/systemd/system/bghub.service`:

```ini
[Unit]
Description=BIGZ Hub Campus Learning Assistant
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/BGHub
ExecStart=/usr/bin/node app.js
Restart=on-failure
Environment=PORT=3000 HOST=0.0.0.0

[Install]
WantedBy=multi-user.target
```

Start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable bghub
sudo systemctl start bghub
```

### Using PM2

```bash
npm install -g pm2
pm2 start app.js --name "bghub"
pm2 save
pm2 startup
```

---

## Development Guide

### Running Tests

```bash
npm test
```

### Code Style Checking

```bash
npm run lint        # Check code style
npm run lint:fix    # Auto-fix style issues
npm run format      # Format code
```

### Adding New Features

1. Add route files in `server/routes/`
2. Add business logic in `server/services/`
3. Create or modify EJS templates in `views/`
4. Add styles and scripts in `public/css/` or `public/js/`
5. Add corresponding test cases in `tests/`

---

## FAQ

### Q: What if I forgot my password?

The current version does not have a password reset feature. Please contact an administrator to reset your password.

### Q: Where can I view uploaded resources?

Resources uploaded by regular users require approval before appearing in the "Resource Library". Admin uploads are directly available.

### Q: How do I become a moderator?

Users reaching LV3 or above (credits ≥300) automatically gain review permissions.

### Q: Why was my post deleted?

Posts may be deleted by administrators for containing sensitive content or violating community guidelines. Contact an administrator if you have questions.

### Q: Can anyone see who posted if I choose anonymous?

When posting anonymously, your nickname displays as "Anonymous User", but administrators can still view the actual poster.

### Q: How do I contact an administrator?

You can contact administrators through email or other official school channels.

---

## Contributing Guidelines

Pull Requests and Issues are welcome. Here's the contribution workflow:

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Use 2-space indentation
- Always use semicolons
- Use single quotes for strings
- Follow ESLint configuration rules
- Add JSDoc comments for new functions

---

## License

This project uses the ISC License.

---

## Contact

- Project Maintainer: BIGZ Hub Team
- School: Guangzhou BASIS International School

---

[Back to Top](#bigz-hub-campus-learning-assistant)

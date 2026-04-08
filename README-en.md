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
- **🔍 Global Search**: One-click search across posts, resources, exams, homework, and all site content

### Technical Highlights

- Built on Node.js + Express 5
- EJS template engine for page rendering
- SQLite database for data storage, easy local deployment
- RESTful API design supporting frontend-backend separation
- Session-based user authentication with secure password hashing

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
cd BGHub/1.0.1
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
```

> **Note**: `SESSION_SECRET` must be set to a complex random string in production environments.

### Step 4: Start the Server

```bash
npm start
```

### Step 5: Access the Application

Open your browser and visit: **http://localhost:3000**

---

## Quick Start

### First-Time Use

1. After accessing the application, click the "Register" button in the top right
2. Register using your school email (@basischina.com) or Gmail
3. Select your grade level (G6-G12)
4. Set your password (minimum 8 characters)
5. Auto-login after successful registration

### First Admin Account

- **Regular Registration**: The first registered account automatically becomes admin (LV4)
- **Supercode Registration**: If you know the admin supercode, filling it during registration grants immediate highest admin privileges (LV6)

### Daily Usage

#### Browsing the Home Page

After logging in, the home page shows:
- Left: Latest posts and notes from classmates
- Center: Subject boards with course content
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

Credits are tied to user levels; higher levels grant more permissions.

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

## Project Structure

```
1.0.1/
├── app.js              # Application entry point
├── package.json        # Project configuration
├── data/               # Data storage
│   ├── bigz-hub-mvp.db # SQLite database
│   └── sessions/       # Session storage
├── public/             # Static resources
│   ├── css/            # Stylesheets
│   ├── js/             # Frontend scripts
│   └── uploads/        # Uploaded files
├── views/              # EJS templates
│   ├── partials/       # Header, footer, and shared components
│   ├── home.ejs        # Home page
│   ├── forum*.ejs      # Forum-related pages
│   ├── board.ejs       # Subject board page
│   ├── exams.ejs       # Exam calendar page
│   ├── homeworks.ejs   # Homework dashboard page
│   └── resources.ejs   # Resource library page
├── tests/              # Test files
│   └── app.test.js     # Unit tests
└── server/
    └── config/         # Server configuration
```

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
| `/api/exams` | GET/POST | Get/create exams |
| `/api/homeworks` | GET/POST | Get/create homework |
| `/api/resources` | GET/POST | Get/upload resources |
| `/api/search` | GET | Search all site content |

For detailed API documentation, see [docs/openapi.yaml](1.0.1/docs/openapi.yaml).

---

## Deployment Guide

### Using systemd (Linux)

Create the service file `/etc/systemd/system/bigz-hub.service`:

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

Start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable bigz-hub
sudo systemctl start bigz-hub
```

### Using PM2

```bash
npm install -g pm2
pm2 start app.js --name "bigz-hub"
pm2 save
pm2 startup
```

---

## Development Guide

### Running Tests

```bash
npm test
```

### Adding New Features

1. Add routes and handling logic in `app.js`
2. Create or modify EJS templates in `views/`
3. Add styles and scripts in `public/css/` or `public/js/`
4. Add corresponding test cases in `tests/`

---

## License

This project uses the ISC License.

---

## Contact

- Project Maintainer: BIGZ Hub Team
- School: Guangzhou BASIS International School

---

[Back to Top](#bigz-hub-campus-learning-assistant)

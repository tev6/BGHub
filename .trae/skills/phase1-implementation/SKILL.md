---
name: "phase1-implementation"
description: "Implements Phase 1 features: Notification Center, WebSocket Real-time, and Private Messaging System. Invoke when user asks to implement Phase 1 changes."
---

# Phase 1 Implementation Helper

This skill provides detailed implementation guidance for BIGZ Hub Phase 1 features.

## Phase 1 Features Overview

Phase 1 focuses on **core functionality improvements**:
1. **Notification Center System** - User notification page with real-time push
2. **WebSocket Real-time** - Replace polling with WebSocket for chat/notifications
3. **Private Messaging System** - One-on-one private messaging between users

## Implementation Prompts

### Prompt 1: Notification Center System

```
Implement the Notification Center for BIGZ Hub.

## Database Changes
Create in app.js initializeDatabase():
- ALTER notifications table: add is_read (default 0), notification_type (enum: 'review', 'system', 'interaction')

## New Routes to Add in app.js
- GET /notifications - Render notifications page (views/notifications.ejs)
- POST /api/notifications/:id/read - Mark single notification as read
- POST /api/notifications/read-all - Mark all notifications as read
- GET /api/notifications/unread-count - Get unread count for header badge

## View: views/notifications.ejs
- List all user notifications sorted by created_at DESC
- Filter tabs: All / Unread / Review / System / Interaction
- Each notification shows: icon, title, content, time, read status
- "Mark all read" button
- Pagination (20 per page)

## Header Modification (views/partials/header.ejs)
- Add bell icon with unread count badge
- Link to /notifications page
- Badge shows count of unread notifications

## Integration with Existing Code
- When review approved/rejected: create notification (already exists, but ensure it's created)
- When someone comments on user's post: create notification
- When homework deadline approaches: create system notification
```

### Prompt 2: WebSocket Real-time System

```
Implement WebSocket real-time functionality for BIGZ Hub.

## Dependencies
The project already has 'ws' library in package.json. Use it.

## Server-side Changes in app.js
```javascript
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

// Store connected clients: Map<userId, WebSocket>
const clients = new Map();

wss.on('connection', (ws, req) => {
  // Authenticate user from session cookie
  // Store ws in clients map by userId
  ws.on('close', () => {
    // Remove from clients map
  });
});

// Helper to broadcast to specific user
function sendToUser(userId, data) {
  const ws = clients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
```

## WebSocket Events
- `notification` - Push new notification to user
- `chat_message` - Broadcast new chat message to all connected clients
- `new_post` - Notify about new posts in subscribed boards

## Client-side Changes in public/js/app.js
```javascript
// Establish WebSocket connection on page load (if user logged in)
const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${location.host}`);

// Handle incoming messages and update UI without refresh
```

## Integration Points
- Chat form submission: broadcast via WebSocket instead of page reload
- New notification: push via WebSocket immediately
- New post in forum: real-time update for active users
```

### Prompt 3: Private Messaging System

```
Implement Private Messaging System for BIGZ Hub.

## Database Schema Additions
Add to initializeDatabase():

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  last_read_at DATETIME,
  UNIQUE(conversation_id, user_id),
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS private_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_private_messages_conversation ON private_messages(conversation_id);
```

## New Routes to Add in app.js

### Conversations
- `GET /messages` - List user's conversations with last message preview
- `POST /api/conversations` - Create or get existing conversation with user
- `GET /api/conversations/:id` - Get conversation messages

### Messages
- `POST /api/conversations/:id/messages` - Send message
- `POST /api/conversations/:id/read` - Mark conversation as read

## API Response Formats

### GET /messages
```json
{
  "conversations": [
    {
      "id": 1,
      "other_user": { "id": 2, "name": "John", "role_level": 3 },
      "last_message": { "content": "Hello", "created_at": "2026-04-03T10:00:00Z" },
      "unread_count": 2
    }
  ]
}
```

### GET /api/conversations/:id
```json
{
  "conversation": { "id": 1 },
  "messages": [
    { "id": 1, "sender_id": 2, "content": "Hello", "created_at": "..." }
  ]
}
```

## Views to Create

### views/messages.ejs
- Conversation list sidebar
- Message thread main area
- Message input form with Markdown support
- "New conversation" button (search users)

### views/conversation.ejs (or integrate into messages.ejs)
- Individual conversation view
- Messages with sender avatar/name
- Read receipts (optional)

## Header Modification
- Add "Messages" link with unread badge
- Show total unread conversations count

## Security Considerations
- Users can only view conversations they participate in
- Rate limit message sending (same as chat: 5/day LV0, 10/day LV1, unlimited LV2+)
- Sanitize message content with DOMPurify
- Validate conversation belongs to user before showing messages

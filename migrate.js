// 创建一个 migrate.js 文件
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'database', 'forum.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // 将现有纯文本内容转换为Markdown格式（简单转换）
    db.run(`UPDATE posts SET content = replace(content, '<br>', '\n'), content_type = 'markdown'`);
    db.run(`UPDATE comments SET content = replace(content, '<br>', '\n'), content_type = 'markdown'`);
    
    console.log('Migration completed');
});

db.close();

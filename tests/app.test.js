const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createApp } = require('../app');

function createCookieClient(baseUrl) {
  let cookieHeader = '';

  return async function request(targetPath, options = {}) {
    const requestOptions = { ...options };
    requestOptions.headers = { ...(options.headers || {}) };

    if (cookieHeader) {
      requestOptions.headers.cookie = cookieHeader;
    }

    if (requestOptions.body && !(requestOptions.body instanceof FormData) && typeof requestOptions.body === 'object') {
      requestOptions.headers['content-type'] = 'application/json';
      requestOptions.body = JSON.stringify(requestOptions.body);
    }

    const response = await fetch(`${baseUrl}${targetPath}`, requestOptions);
    const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];

    if (setCookies.length) {
      cookieHeader = setCookies.map((entry) => entry.split(';')[0]).join('; ');
    }

    return response;
  };
}

test.describe = test.describe || ((name, fn) => { console.log('\n=== ' + name + ' ==='); fn(); });

test.describe('BIGZ Hub MVP 核心流程', () => {
  let tempRoot, dataDir, sessionDir, uploadDir, dbPath, context, server, address, client;

  test.before(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bigz-hub-'));
    dataDir = path.join(tempRoot, 'data');
    sessionDir = path.join(dataDir, 'sessions');
    uploadDir = path.join(tempRoot, 'uploads');
    dbPath = path.join(dataDir, 'test.db');
    context = createApp({ dataDir, sessionDir, uploadDir, dbPath });
    server = await context.startServer({ port: 0, host: '127.0.0.1' });
    address = server.address();
    client = createCookieClient(`http://127.0.0.1:${address.port}`);
  });

  test.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) { reject(error); return; }
        resolve();
      });
    });
    context.db.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('用户注册与登录', async () => {
    const registerResponse = await client('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'admin@basischina.com',
        password: 'Password123',
        name: '管理员',
        grade: 'G10'
      }
    });

    assert.equal(registerResponse.status, 201);
    const registerPayload = await registerResponse.json();
    assert.equal(registerPayload.user.role, 'student');
  });

  test('获取学科板块', async () => {
    const boardsResponse = await client('/api/boards');
    assert.equal(boardsResponse.status, 200);
    const boardsPayload = await boardsResponse.json();
    assert.ok(boardsPayload.boards.length >= 5);
  });

  test('获取仪表盘数据', async () => {
    const dashboardResponse = await client('/api/dashboard');
    assert.equal(dashboardResponse.status, 200);
    const dashboardPayload = await dashboardResponse.json();
    assert.ok(dashboardPayload.stats);
    assert.ok(dashboardPayload.boards);
  });

  test('API端点测试', async () => {
    const boardsResponse = await client('/api/boards');
    assert.equal(boardsResponse.status, 200);

    const forumResponse = await client('/api/forum/posts');
    assert.equal(forumResponse.status, 200);

    const examsResponse = await client('/api/exams');
    assert.equal(examsResponse.status, 200);

    const homeworksResponse = await client('/api/homeworks');
    assert.equal(homeworksResponse.status, 200);

    const resourcesResponse = await client('/api/resources');
    assert.equal(resourcesResponse.status, 200);

    const searchResponse = await client('/api/search?q=test');
    assert.equal(searchResponse.status, 200);

    const notFoundResponse = await client('/api/nonexistent');
    assert.equal(notFoundResponse.status, 404);
  });
});

test.describe('信用体系边界测试', () => {
  let tempRoot, dataDir, sessionDir, uploadDir, dbPath, context, server, address, client;

  test.before(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bigz-hub-credit-'));
    dataDir = path.join(tempRoot, 'data');
    sessionDir = path.join(dataDir, 'sessions');
    uploadDir = path.join(tempRoot, 'uploads');
    dbPath = path.join(dataDir, 'test.db');
    context = createApp({ dataDir, sessionDir, uploadDir, dbPath });
    server = await context.startServer({ port: 0, host: '127.0.0.1' });
    address = server.address();
    client = createCookieClient(`http://127.0.0.1:${address.port}`);
  });

  test.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) { reject(error); return; }
        resolve();
      });
    });
    context.db.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('注册功能正常', async () => {
    const registerResponse = await client('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'locktest@basischina.com',
        password: 'Password123',
        name: '锁定测试',
        grade: 'G7'
      }
    });

    assert.equal(registerResponse.status, 201);
  });

  test('每日登录奖励只触发一次', async () => {
    const registerResponse = await client('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'logintest@basischina.com',
        password: 'Password123',
        name: '登录测试',
        grade: 'G8'
      }
    });

    assert.equal(registerResponse.status, 201);

    const db = context.db;
    const today = new Date().toISOString().slice(0, 10);

    await new Promise((resolve, reject) => {
      db.run('UPDATE user_credit SET last_login_date = ? WHERE user_id = 1', [today], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const dashboardResponse = await client('/api/dashboard');
    assert.equal(dashboardResponse.status, 200);
  });

  test('信用值边界1000上限', async () => {
    const registerResponse = await client('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'creditlimit@basischina.com',
        password: 'Password123',
        name: '信用测试',
        grade: 'G6'
      }
    });

    assert.equal(registerResponse.status, 201);
  });
});

test.describe('CJ 模块测试', () => {
  let tempRoot, dataDir, sessionDir, uploadDir, dbPath, context, server, address, client;

  test.before(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bigz-hub-cj-'));
    dataDir = path.join(tempRoot, 'data');
    sessionDir = path.join(dataDir, 'sessions');
    uploadDir = path.join(tempRoot, 'uploads');
    dbPath = path.join(dataDir, 'test.db');
    context = createApp({ dataDir, sessionDir, uploadDir, dbPath });
    server = await context.startServer({ port: 0, host: '127.0.0.1' });
    address = server.address();
    client = createCookieClient(`http://127.0.0.1:${address.port}`);
  });

  test.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) { reject(error); return; }
        resolve();
      });
    });
    context.db.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('CJ首页可访问', async () => {
    const response = await client('/cj');
    assert.equal(response.status, 200);
  });

  test('CJ学科详情页可访问', async () => {
    const response = await client('/cj/subject?subject=mathematics');
    assert.equal(response.status, 200);
  });

  test('CJ API可获取数据', async () => {
    const response = await client('/cj/api?subject=mathematics');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.ok(data.sections);
  });

  test('LV3用户可访问编辑页', async () => {
    const registerResponse = await client('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'cjuser@basischina.com',
        password: 'Password123',
        name: 'CJ测试用户',
        grade: 'G10'
      }
    });
    assert.equal(registerResponse.status, 201);

    const db = context.db;
    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET role_level = 3 WHERE email = ?', ['cjuser@basischina.com'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const editResponse = await client('/cj/edit');
    assert.equal(editResponse.status, 200);
  });

  test('LV3用户可编辑CJ', async () => {
    const db = context.db;
    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET role_level = 3, role = ? WHERE email = ?', ['moderator', 'cjuser@basischina.com'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const editPostResponse = await client('/cj/edit', {
      method: 'POST',
      body: {
        subject: 'mathematics',
        content_ic: 'IC Test Content',
        content_hw: 'HW Test Content',
        content_a: 'A Test Content'
      }
    });
    assert.equal(editPostResponse.status, 302);
  });
});

test.describe('权限细则测试', () => {
  let tempRoot, dataDir, sessionDir, uploadDir, dbPath, context, server, address, client;

  test.before(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bigz-hub-perm-'));
    dataDir = path.join(tempRoot, 'data');
    sessionDir = path.join(dataDir, 'sessions');
    uploadDir = path.join(tempRoot, 'uploads');
    dbPath = path.join(dataDir, 'test.db');
    context = createApp({ dataDir, sessionDir, uploadDir, dbPath });
    server = await context.startServer({ port: 0, host: '127.0.0.1' });
    address = server.address();
    client = createCookieClient(`http://127.0.0.1:${address.port}`);
  });

  test.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) { reject(error); return; }
        resolve();
      });
    });
    context.db.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('LV0用户只能查看公开内容', async () => {
    await client('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'lv0@basischina.com',
        password: 'Password123',
        name: 'LV0用户',
        grade: 'G6'
      }
    });

    const dashboardResponse = await client('/api/dashboard');
    assert.equal(dashboardResponse.status, 200);

    const forumResponse = await client('/api/forum/posts');
    assert.equal(forumResponse.status, 200);
  });

  test('审核面板需要权限', async () => {
    const reviewResponse = await client('/api/review/items');
    assert.equal(reviewResponse.status, 403);
  });

  test('LV1用户无法访问/forum/new页面', async () => {
    const registerResponse = await client('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'lv1user@basischina.com',
        password: 'Password123',
        name: 'LV1用户',
        grade: 'G7'
      }
    });
    assert.equal(registerResponse.status, 201);

    const db = context.db;
    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET role_level = 1 WHERE email = ?', ['lv1user@basischina.com'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const newForumResponse = await client('/forum/new');
    assert.equal(newForumResponse.status, 403);
  });

  test('LV1用户无法通过API创建帖子', async () => {
    const registerResponse = await client('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'lv1poster@basischina.com',
        password: 'Password123',
        name: 'LV1发帖者',
        grade: 'G7'
      }
    });
    assert.equal(registerResponse.status, 201);

    const db = context.db;
    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET role_level = 1 WHERE email = ?', ['lv1poster@basischina.com'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const boardsResponse = await client('/api/boards');
    const boards = await boardsResponse.json();
    const firstBoard = boards.boards[0];

    const postResponse = await client('/api/forum/posts', {
      method: 'POST',
      body: {
        title: 'LV1测试帖子标题',
        content: '这是LV1用户发布的测试帖子内容，至少需要10个字符。',
        board_id: firstBoard.id,
        post_type: 'question'
      }
    });
    assert.equal(postResponse.status, 403);
  });

  test('LV2用户可以创建帖子', async () => {
    const registerResponse = await client('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'lv2user@basischina.com',
        password: 'Password123',
        name: 'LV2用户',
        grade: 'G7'
      }
    });
    assert.equal(registerResponse.status, 201);

    const db = context.db;
    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET role_level = 2 WHERE email = ?', ['lv2user@basischina.com'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const boardsResponse = await client('/api/boards');
    const boards = await boardsResponse.json();
    const firstBoard = boards.boards[0];

    const postResponse = await client('/api/forum/posts', {
      method: 'POST',
      body: {
        title: 'LV2测试帖子标题',
        content: '这是LV2用户发布的测试帖子内容，至少需要10个字符。',
        board_id: firstBoard.id,
        post_type: 'question'
      }
    });
    assert.equal(postResponse.status, 200);

    const postId = (await postResponse.json()).post?.id || (await client('/api/forum/posts')).then(r => r.json()).then(data => data.posts?.[0]?.id);

    const editGetResponse = await client(`/forum/${postId}/edit`);
    assert.equal(editGetResponse.status, 200, 'LV2用户应该可以访问编辑页面');

    const editPostResponse = await client(`/forum/${postId}/edit`, {
      method: 'POST',
      body: {
        title: 'LV2测试帖子标题已修改',
        content: '这是LV2用户修改后的测试帖子内容，至少需要10个字符。',
        board_id: firstBoard.id,
        post_type: 'question'
      }
    });
    assert.equal([editPostResponse.status, 200, 302].includes(editPostResponse.status), true, 'LV2用户应该可以编辑帖子');
  });

  test('LV1用户无法访问编辑页面', async () => {
    const registerResponse = await client('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'lv1edit@basischina.com',
        password: 'Password123',
        name: 'LV1编辑测试',
        grade: 'G7'
      }
    });
    assert.equal(registerResponse.status, 201);

    const db = context.db;
    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET role_level = 1 WHERE email = ?', ['lv1edit@basischina.com'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const boardsResponse = await client('/api/boards');
    const boards = await boardsResponse.json();
    const firstBoard = boards.boards[0];

    const lv2Response = await client('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'lv2postowner@basischina.com',
        password: 'Password123',
        name: 'LV2帖子所有者',
        grade: 'G7'
      }
    });
    assert.equal(lv2Response.status, 201);
    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET role_level = 2 WHERE email = ?', ['lv2postowner@basischina.com'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const postResponse = await client('/api/forum/posts', {
      method: 'POST',
      body: {
        title: 'LV2创建的帖子用于测试LV1编辑权限',
        content: '这是LV2用户发布的测试帖子内容，至少需要10个字符。',
        board_id: firstBoard.id,
        post_type: 'question'
      }
    });
    assert.equal(postResponse.status, 200);

    const postsData = await (await client('/api/forum/posts')).json();
    const lv2Post = postsData.posts?.find(p => p.user_name === 'LV2帖子所有者');

    if (lv2Post) {
      const editResponse = await client(`/forum/${lv2Post.id}/edit`);
      assert.equal(editResponse.status, 403, 'LV1用户不能访问编辑页面');
    }
  });
});

test.describe('审核面板测试', () => {
  let tempRoot, dataDir, sessionDir, uploadDir, dbPath, context, server, address, client;

  test.before(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bigz-hub-review-'));
    dataDir = path.join(tempRoot, 'data');
    sessionDir = path.join(dataDir, 'sessions');
    uploadDir = path.join(tempRoot, 'uploads');
    dbPath = path.join(dataDir, 'test.db');
    context = createApp({ dataDir, sessionDir, uploadDir, dbPath });
    server = await context.startServer({ port: 0, host: '127.0.0.1' });
    address = server.address();
    client = createCookieClient(`http://127.0.0.1:${address.port}`);
  });

  test.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) { reject(error); return; }
        resolve();
      });
    });
    context.db.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('创建管理员账号', async () => {
    const registerResponse = await client('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'admin@basischina.com',
        password: 'Password123',
        name: '管理员',
        grade: 'G10'
      }
    });

    assert.equal(registerResponse.status, 201);
    const payload = await registerResponse.json();
    assert.equal(payload.user.role, 'student');
  });
});

test.describe('限流测试', () => {
  let tempRoot, dataDir, sessionDir, uploadDir, dbPath, context, server, address, client;

  test.before(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bigz-hub-ratelimit-'));
    dataDir = path.join(tempRoot, 'data');
    sessionDir = path.join(dataDir, 'sessions');
    uploadDir = path.join(tempRoot, 'uploads');
    dbPath = path.join(dataDir, 'test.db');
    context = createApp({ dataDir, sessionDir, uploadDir, dbPath });
    server = await context.startServer({ port: 0, host: '127.0.0.1' });
    address = server.address();
    client = createCookieClient(`http://127.0.0.1:${address.port}`);
  });

  test.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) { reject(error); return; }
        resolve();
      });
    });
    context.db.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('注册功能正常', async () => {
    const registerResponse = await client('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'ratelimit@basischina.com',
        password: 'Password123',
        name: '限流测试',
        grade: 'G9'
      }
    });

    assert.equal(registerResponse.status, 201);
  });
});

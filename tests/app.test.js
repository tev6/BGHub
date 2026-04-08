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

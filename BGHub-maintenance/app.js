const express = require('express');
const path = require('path');
const http = require('http');

const DEFAULT_PORT = 3000;
const DEFAULT_PAGE = 'maintenance';

const PAGES = {
  maintenance: {
    file: 'maintenance.html',
    title: '网站维护中',
    description: '网站正在维护中，请稍后再试。'
  },
  update: {
    file: 'update.html',
    title: '系统更新中',
    description: '系统正在更新，请稍后再试。'
  },
  'service-off': {
    file: 'service-off.html',
    title: '服务暂时不可用',
    description: '服务暂时不可用，请稍后再试。'
  }
};

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    page: DEFAULT_PAGE,
    port: DEFAULT_PORT,
    estimatedTime: null,
    errorCode: null,
    errorDetails: null,
    newFeatures: null,
    autoProgress: true,
    title: null,
    description: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--page' || arg === '-p') {
      const page = args[++i];
      if (page && PAGES[page]) {
        config.page = page;
      }
    } else if (arg === '--port' || arg === '-P') {
      const port = parseInt(args[++i], 10);
      if (!isNaN(port) && port > 0) {
        config.port = port;
      }
    } else if (arg === '--time' || arg === '-t') {
      config.estimatedTime = args[++i] || '即将恢复';
    } else if (arg === '--error' || arg === '-e') {
      config.errorCode = args[++i] || 'SERVICE_UNAVAILABLE';
    } else if (arg === '--details') {
      const detailsStr = args[++i];
      if (detailsStr) {
        config.errorDetails = detailsStr.split('|');
      }
    } else if (arg === '--features') {
      const featuresStr = args[++i];
      if (featuresStr) {
        config.newFeatures = featuresStr.split('|');
      }
    } else if (arg === '--no-progress') {
      config.autoProgress = false;
    } else if (arg === '--title') {
      config.title = args[++i];
    } else if (arg === '--description') {
      config.description = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--list') {
      console.log('\n可用页面:');
      Object.keys(PAGES).forEach(key => {
        console.log(`  - ${key}: ${PAGES[key].title}`);
      });
      console.log('');
      process.exit(0);
    }
  }

  return config;
}

function printHelp() {
  console.log(`
BGHub 维护页面服务器

用法:
  node app.js [选项]

选项:
  --page, -p <页面>     选择显示的页面 (默认: maintenance)
                       可选值: ${Object.keys(PAGES).join(', ')}

  --port, -P <端口>    设置服务器端口 (默认: ${DEFAULT_PORT})

  --time, -t <时间>    设置预计恢复时间

  --error, -e <代码>   设置错误代码 (用于 service-off 页面)

  --details <详情>     设置错误详情 (用 | 分隔多项)

  --features <特性>    设置新版本特性 (用 | 分隔多项，用于 update 页面)

  --no-progress        禁用更新进度动画

  --title <标题>       自定义页面标题

  --description <描述> 自定义页面描述

  --list               列出所有可用页面

  --help, -h           显示此帮助信息

示例:
  node app.js --page maintenance --port 3001
  node app.js -p update -t "2024-01-01 12:00"
  node app.js -p service-off -e "MAINTENANCE_MODE" --details "服务器重启中|请稍后再试"
  node app.js -p update --features "性能优化|新功能A|新功能B"
  `);
}

function createApp(config) {
  const app = express();
  const pageConfig = PAGES[config.page];

  app.use((req, res, next) => {
    res.locals.config = config;
    next();
  });

  app.get('/', (req, res) => {
    const pagePath = path.join(__dirname, pageConfig.file);
    res.sendFile(pagePath, (err) => {
      if (err) {
        console.error(`Error serving ${pageConfig.file}:`, err);
        res.status(500).send('Page not found');
      }
    });
  });

  app.get('/config.js', (req, res) => {
    const configScript = `window.MAINTENANCE_CONFIG = ${JSON.stringify({
      page: config.page,
      estimatedTime: config.estimatedTime || null,
      errorCode: config.errorCode || null,
      errorDetails: config.errorDetails || null,
      newFeatures: config.newFeatures || null,
      autoProgress: config.autoProgress,
      customTitle: config.title,
      customDescription: config.description
    }, null, 2)};`;
    res.type('application/javascript').send(configScript);
  });

  app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css')));
  app.use('/js', express.static(path.join(__dirname, '..', 'public', 'js')));
  app.use('/images', express.static(path.join(__dirname, '..', 'public', 'images')));
  app.use('/locales', express.static(path.join(__dirname, '..', 'server', 'locales')));

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      page: config.page,
      timestamp: new Date().toISOString()
    });
  });

  return app;
}

function startServer(config) {
  const app = createApp(config);
  const server = http.createServer(app);

  server.listen(config.port, () => {
    const pageConfig = PAGES[config.page];
    console.log(`
╔══════════════════════════════════════════════════════╗
║           BGHub 维护页面服务器                        ║
╠══════════════════════════════════════════════════════╣
║  页面类型: ${pageConfig.title.padEnd(40)}║
║  服务端口: ${String(config.port).padEnd(40)}║
║  访问地址: http://localhost:${config.port}${''.padEnd(25)}║
║  启动时间: ${new Date().toLocaleString().padEnd(40)}║
╚══════════════════════════════════════════════════════╝

查看帮助: node app.js --help
    `);
  });

  process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    server.close(() => {
      console.log('服务器已关闭');
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    console.log('\n收到终止信号，正在关闭服务器...');
    server.close(() => {
      console.log('服务器已关闭');
      process.exit(0);
    });
  });
}

if (require.main === module) {
  const config = parseArgs();
  startServer(config);
}

module.exports = { createApp, startServer, parseArgs, PAGES };

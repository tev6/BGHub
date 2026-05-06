require('dotenv').config();
const OpenAI = require('openai');
const logger = require('../utils/logger');

const client = new OpenAI({
  baseURL: process.env.KOURI_API_BASE_URL || 'https://api.kourichat.com/v1',
  apiKey: process.env.KOURI_API_KEY || ''
});

const MODERATION_MODEL = process.env.KOURI_MODERATION_MODEL || 'gpt-4o';

const REVIEW_PROMPT = `你是一个校园论坛内容审核助手。请判断以下内容是否违规。

**违规类型：**
- 涉政：涉及政治敏感话题
- 涉黄：色情、低俗内容
- 涉暴：暴力、血腥内容
- 广告：垃圾广告、商业推广
- 虚假信息：故意编造的虚假内容（如虚假考试信息）

**回复格式（严格按此格式）：**
PASS - 内容正常，可以发布
REJECT - 内容违规，不可发布

**内容如下：**
`;

async function moderateContent(content, context = '') {
  logger.debug('[AI审核] moderateContent 被调用', { 
    hasApiKey: !!process.env.KOURI_API_KEY,
    model: MODERATION_MODEL 
  });

  if (!process.env.KOURI_API_KEY) {
    logger.warn('[AI审核] 未配置KOURI_API_KEY，跳过审核');
    return { decision: 'PASS', reason: 'AI未配置，默认通过' };
  }

  const fullContent = context ? `${context}\n\n${content}` : content;
  const requestContent = `${REVIEW_PROMPT}${fullContent}`;

  try {
    logger.debug('[AI审核] 正在调用 Kouri API...');
    const startTime = Date.now();

    const response = await client.chat.completions.create({
      model: MODERATION_MODEL,
      messages: [
        {
          role: 'user',
          content: requestContent
        }
      ],
      max_tokens: 50,
      temperature: 0
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    const result = response.choices[0]?.message?.content?.trim() || '';
    logger.info('[AI审核] API 调用完成', { 
      result: result.substring(0, 50),
      duration: `${duration}ms` 
    });

    if (result.startsWith('PASS')) {
      return { decision: 'PASS', reason: result };
    } else if (result.startsWith('REJECT')) {
      return { decision: 'REJECT', reason: result };
    } else {
      logger.warn('[AI审核] 无法解析结果', { result: result.substring(0, 100) });
      return { decision: 'PASS', reason: '无法判断，默认通过' };
    }
  } catch (error) {
    logger.error('[AI审核] 调用失败', { 
      error: error.message,
      stack: error.stack 
    });
    return { decision: 'PASS', reason: `AI服务异常: ${error.message}` };
  }
}

async function moderateChatMessage(content) {
  logger.debug('[AI审核] moderateChatMessage 被调用', { 
    contentPreview: content.substring(0, 50) 
  });
  return moderateContent(content, '这是聊天区的消息');
}

async function moderatePost(title, body) {
  logger.debug('[AI审核] moderatePost 被调用', { 
    titlePreview: title.substring(0, 50) 
  });
  return moderateContent(
    `标题：${title}\n\n内容：${body}`,
    '这是论坛帖子'
  );
}

async function moderateResource(title, description) {
  logger.debug('[AI审核] moderateResource 被调用', { 
    titlePreview: title.substring(0, 50) 
  });
  return moderateContent(
    `资源名称：${title}\n描述：${description}`,
    '这是课件库资源'
  );
}

module.exports = {
  moderateContent,
  moderateChatMessage,
  moderatePost,
  moderateResource
};
/**
 * 每日话题生成 API
 * 从邮箱获取 TrendRadar 邮件 → 转 Markdown → 调 LLM → 按分类生成话题 → 存入 DB
 */

import TurndownService from 'turndown';
import { getAIConfig } from '~/server/utils/ai-config';
import db from '~/server/database/index';
import { getAllCategories } from '~/server/database/models/category';

interface TopicItem {
  title: string;
  angle: string;
  viralPoint: string;
}

interface CategoryTopics {
  category: string;
  topics: TopicItem[];
}

export default defineEventHandler(async event => {
  try {
    const imapHost = process.env.EMAIL_IMAP_HOST || '';
    const imapPort = Number(process.env.EMAIL_IMAP_PORT) || 993;
    const emailUser = process.env.EMAIL_USER || '';
    const emailPass = process.env.EMAIL_PASS || '';

    if (!imapHost || !emailUser || !emailPass) {
      return { success: false, error: '未配置邮箱信息，请在 .env 中设置 EMAIL_IMAP_HOST、EMAIL_USER、EMAIL_PASS' };
    }

    const { apiKey, apiBase, model } = getAIConfig();

    if (!apiKey) {
      return { success: false, error: '未配置 AI API，请在 .env 中设置 AI_API_KEY' };
    }

    // 1. 从邮箱获取 TrendRadar 最新邮件
    const emailContent = await fetchLatestTrendRadar(imapHost, imapPort, emailUser, emailPass);

    // 2. HTML 预处理 + 转 Markdown
    // 先用 cheerio 清理无关标签，提取正文
    const { load } = await import('cheerio');
    const $ = load(emailContent.html);
    // 移除 style、script 标签
    $('style, script').remove();
    // 尝试找邮件正文容器，否则用整个 body
    const bodyHtml = $('.container').html() || $('body').html() || $.html();

    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    const markdown = td.turndown(bodyHtml || emailContent.html);

    console.log(`[TrendRadar] 邮件主题: ${emailContent.subject}`);
    console.log(`[TrendRadar] Markdown 长度: ${markdown.length} 字符`);
    console.log(`[TrendRadar] 内容预览:\n${markdown.substring(0, 500)}`);

    // 3. 获取运营公众号的所有分类
    const categories = getManagedCategories();
    if (categories.length === 0) {
      return { success: false, error: '没有启用的运营公众号或未设置分类' };
    }

    // 4. 调用 LLM 生成话题
    const categoryList = categories.join('、');
    const systemPrompt = `你是一位资深的微信公众号选题策划专家，擅长从时事热点中挖掘爆款选题。

请根据提供的趋势资讯内容，为以下每个分类各生成 5 个潜在爆款话题建议。

分类列表：${categoryList}

每个话题需包含：
- title: 选题标题（吸引眼球）
- angle: 核心切入角度
- viralPoint: 预计爆点（为什么可能火）

请严格按以下 JSON 格式输出，不要包含任何其他内容：
[
  {"category": "分类一", "topics": [
    {"title": "...", "angle": "...", "viralPoint": "..."},
    {"title": "...", "angle": "...", "viralPoint": "..."},
    {"title": "...", "angle": "...", "viralPoint": "..."},
    {"title": "...", "angle": "...", "viralPoint": "..."},
    {"title": "...", "angle": "...", "viralPoint": "..."}
  ]},
  {"category": "分类二", "topics": [...]}
]`;

    const today = new Date().toLocaleDateString('zh-CN');
    const userPrompt = `日期：${today}\n\n以下是今日趋势资讯：\n\n${markdown.substring(0, 8000)}`;

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('AI API error:', response.status, errBody);
      return { success: false, error: `AI API 调用失败 (${response.status}): ${errBody.substring(0, 200)}` };
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';

    // 5. 解析 JSON
    let categoryTopics: CategoryTopics[] = [];
    try {
      const jsonMatch = reply.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        categoryTopics = JSON.parse(jsonMatch[0]) as CategoryTopics[];
      }
    } catch {
      // 解析失败
    }

    if (categoryTopics.length === 0) {
      return { success: false, error: 'AI 返回格式异常，请重试' };
    }

    // 6. 存入数据库（先清除当日旧数据再插入）
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const insertStmt = db.prepare(
      `INSERT INTO daily_topics (topic_date, category, title, angle, viral_point, email_subject)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const insertAll = db.transaction(() => {
      db.prepare(`DELETE FROM daily_topics WHERE topic_date = ?`).run(dateStr);
      for (const ct of categoryTopics) {
        for (const topic of ct.topics) {
          insertStmt.run(dateStr, ct.category, topic.title, topic.angle, topic.viralPoint, emailContent.subject);
        }
      }
    });

    insertAll();

    return { success: true, data: { date: dateStr, categories: categoryTopics.length, totalTopics: categoryTopics.reduce((sum, ct) => sum + ct.topics.length, 0) } };
  } catch (error) {
    console.error('Fetch topics failed:', error);
    return { success: false, error: error instanceof Error ? error.message : '获取失败' };
  }
});

/**
 * 通过 IMAP 获取最新的 TrendRadar 邮件
 */
async function fetchLatestTrendRadar(host: string, port: number, user: string, pass: string): Promise<{ subject: string; html: string }> {
  const { ImapFlow } = await import('imapflow');
  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false as any,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // 搜索主题包含 TrendRadar 的邮件（返回 UID 列表）
      const uids: number[] = await client.search({ subject: 'TrendRadar' }, { uid: true });

      if (!uids || uids.length === 0) {
        throw new Error('未找到 TrendRadar 邮件');
      }

      // 取最新一封（UID 最大）
      const latestUid = Math.max(...uids);

      // 用 UID 获取邮件源码和信封
      let rawSource = '';
      let emailSubject = '';

      const messages = client.fetch(`${latestUid}`, { source: true, envelope: true }, { uid: true });
      for await (const msg of messages) {
        if (msg.source) {
          rawSource = Buffer.isBuffer(msg.source) ? msg.source.toString('utf-8') : String(msg.source);
        }
        if (msg.envelope?.subject) {
          emailSubject = msg.envelope.subject;
        }
      }

      if (!rawSource) {
        throw new Error('无法获取邮件内容');
      }

      // 解析邮件内容
      const html = extractHtmlFromRaw(rawSource);
      return { subject: emailSubject, html };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

/**
 * 从原始 MIME 邮件中提取 HTML 内容
 */
function extractHtmlFromRaw(raw: string): string {
  // 查找 base64 编码的 HTML 部分
  const b64HtmlMatch = raw.match(
    /Content-Type:\s*text\/html;?[\s\S]*?Content-Transfer-Encoding:\s*base64[\s\S]*?\r\n\r\n([\s\S]*?)(?=\r\n--)/i
  );
  if (b64HtmlMatch) {
    try {
      const decoded = Buffer.from(b64HtmlMatch[1].replace(/\s/g, ''), 'base64').toString('utf-8');
      if (decoded.length > 50) return decoded;
    } catch {
      // 继续
    }
  }

  // 查找 quoted-printable 编码的 HTML 部分
  const qpHtmlMatch = raw.match(
    /Content-Type:\s*text\/html;?[\s\S]*?Content-Transfer-Encoding:\s*quoted-printable[\s\S]*?\r\n\r\n([\s\S]*?)(?=\r\n--)/i
  );
  if (qpHtmlMatch) {
    let html = qpHtmlMatch[1];
    html = html.replace(/=\r?\n/g, '');
    html = html.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    html = html.replace(/=\?UTF-8\?B\?([\s\S]*?)\?=/gi, (_, b64) => Buffer.from(b64, 'base64').toString('utf-8'));
    if (html.length > 50) return html;
  }

  // 查找纯文本 HTML（无特殊编码）
  const plainHtmlMatch = raw.match(
    /Content-Type:\s*text\/html;?[\s\S]*?\r\n\r\n([\s\S]*?)(?=\r\n--)/i
  );
  if (plainHtmlMatch && plainHtmlMatch[1].length > 50) {
    return plainHtmlMatch[1];
  }

  // 降级：尝试提取纯文本
  const b64TextMatch = raw.match(
    /Content-Type:\s*text\/plain;?[\s\S]*?Content-Transfer-Encoding:\s*base64[\s\S]*?\r\n\r\n([\s\S]*?)(?=\r\n--)/i
  );
  if (b64TextMatch) {
    try {
      return Buffer.from(b64TextMatch[1].replace(/\s/g, ''), 'base64').toString('utf-8');
    } catch {
      // 继续
    }
  }

  const textMatch = raw.match(
    /Content-Type:\s*text\/plain;?[\s\S]*?\r\n\r\n([\s\S]*?)(?=\r\n--)/i
  );
  if (textMatch) return textMatch[1];

  // 最后降级：返回包含 <html 或 <body 标签的内容
  const tagMatch = raw.match(/<html[\s\S]*<\/html>/i) || raw.match(/<body[\s\S]*<\/body>/i);
  if (tagMatch) return tagMatch[0];

  return raw.substring(0, 5000);
}

/**
 * 获取所有启用的运营公众号的分类（去重）
 */
function getManagedCategories(): string[] {
  const rows = db.prepare(`SELECT DISTINCT category FROM managed_accounts WHERE enabled = 1 AND category IS NOT NULL AND category != ''`).all() as { category: string }[];
  return rows.map(r => r.category);
}

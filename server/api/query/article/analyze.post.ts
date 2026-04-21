/**
 * 爆文解析 API
 * 接收文章链接，抓取内容，调用大模型进行多维度分析
 */

import { getArticleHtmlByUrl } from '~/server/database/models/html';
import { getAllCategories } from '~/server/database/models/category';
import { getAIConfig } from '~/server/utils/ai-config';
import db from '~/server/database/index';

interface AnalysisResult {
  category: string;
  titleAnalysis: string;
  structureAnalysis: string;
  writingTechniques: string;
  reusableTemplate: string;
  viralElements: string;
  goldenSentences: string;
  summary: string;
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { url } = body;

    if (!url) {
      return { success: false, error: '请提供文章链接' };
    }

    // 1. 获取文章 HTML 内容
    let htmlContent = '';

    // 先从数据库查找已下载的 HTML
    const htmlRecord = getArticleHtmlByUrl(url);
    if (htmlRecord?.html_content) {
      htmlContent = htmlRecord.html_content;
    } else {
      // 未下载过，直接抓取
      try {
        const resp = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        htmlContent = await resp.text();
      } catch {
        return { success: false, error: '无法获取文章内容，请确认链接有效' };
      }
    }

    // 2. 提取纯文本内容
    const textContent = extractText(htmlContent);
    if (!textContent || textContent.length < 50) {
      return { success: false, error: '文章内容过少或无法解析' };
    }

    // 3. 提取文章标题
    const title = extractTitle(htmlContent);

    // 4. 获取分类列表，调用大模型分析
    const categories = buildCategoryList();
    const analysis = await callLLMAnalysis(textContent, categories);

    // 5. 保存到数据库
    try {
      db.prepare(
        `INSERT INTO article_analysis (url, title, category, title_analysis, structure_analysis, writing_techniques, reusable_template, viral_elements, golden_sentences, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        url,
        title,
        analysis.category,
        analysis.titleAnalysis,
        analysis.structureAnalysis,
        analysis.writingTechniques,
        analysis.reusableTemplate,
        analysis.viralElements,
        analysis.goldenSentences,
        analysis.summary
      );
    } catch (dbErr) {
      console.error('Failed to save analysis to DB:', dbErr);
    }

    return { success: true, data: { ...analysis, title } };
  } catch (error) {
    console.error('Article analysis failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '解析失败',
    };
  }
});

/**
 * 从 HTML 提取文章标题
 */
function extractTitle(html: string): string {
  // 微信文章标题在 id="activity-name" 的标签中
  const match = html.match(/id="activity-name"[^>]*>([\s\S]*?)<\/h\d>/i);
  if (match) {
    return match[1].replace(/<[^>]+>/g, '').trim();
  }
  // 降级：取 <title>
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].replace(/<[^>]+>/g, '').trim();
  }
  return '';
}

/**
 * 从 HTML 提取纯文本
 */
function extractText(html: string): string {
  // 去除 script、style 标签
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  // 提取 id="js_content" 区域（微信文章正文）
  const contentMatch = text.match(/id="js_content"[\s\S]*?>([\s\S]*?)<\/div>\s*<script/i);
  if (contentMatch) {
    text = contentMatch[1];
  }
  // 去除 HTML 标签
  text = text.replace(/<[^>]+>/g, '\n');
  // 清理空白
  text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

/**
 * 调用大模型进行爆文分析
 */
/**
 * 构建分类列表文本
 */
function buildCategoryList(): string {
  const cats = getAllCategories();
  // 构建层级结构文本
  const roots = cats.filter(c => !c.parent_id);
  const childrenMap = new Map<number, string[]>();
  for (const c of cats) {
    if (c.parent_id) {
      const list = childrenMap.get(c.parent_id) || [];
      list.push(c.name);
      childrenMap.set(c.parent_id, list);
    }
  }
  const lines: string[] = [];
  for (const root of roots) {
    const subs = childrenMap.get(root.id);
    if (subs && subs.length > 0) {
      lines.push(`${root.name}（${subs.join('、')}）`);
    } else {
      lines.push(root.name);
    }
  }
  return lines.join('、');
}

/**
 * 调用大模型进行爆文分析
 */
async function callLLMAnalysis(content: string, categoryList: string): Promise<AnalysisResult> {
  const { apiKey, apiBase, model } = getAIConfig();

  if (!apiKey) {
    throw new Error('未配置 AI API，请在 .env 中设置 AI_API_KEY');
  }

  // 从数据库读取提示词
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('analysis_prompt') as
    | { value: string }
    | undefined;
  const systemPrompt = row?.value || '请分析以下文章内容，输出 JSON 格式的分析结果。';

  // 截取内容避免超长
  const truncatedContent = content.length > 8000 ? content.substring(0, 8000) + '...(内容过长已截断)' : content;

  const userPrompt = `请分析以下微信公众号文章内容：

【分类范围】请从以下分类中选择最匹配的：${categoryList || '科技、财经、教育、健康、娱乐、文化、政治、生活、其他'}

${truncatedContent}`;

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API 调用失败 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content || '';

  // 尝试解析 JSON 响应
  try {
    // 提取 JSON 部分（可能被 markdown 代码块包裹）
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as AnalysisResult;
    }
  } catch {
    // JSON 解析失败，用原始文本填充
  }

  // 降级处理：将整段回复作为总结
  return {
    category: '',
    titleAnalysis: '',
    structureAnalysis: '',
    writingTechniques: '',
    reusableTemplate: '',
    viralElements: '',
    goldenSentences: '',
    summary: reply,
  };
}

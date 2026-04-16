/**
 * 选题生成 API
 * 基于运营公众号的人设、分类和爆文数据，调用大模型生成选题建议
 */

import { getAIConfig } from '~/server/utils/ai-config';
import db from '~/server/database/index';

interface TopicItem {
  title: string;
  angle: string;
  viralPoint: string;
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { accountId } = body;

    if (!accountId) {
      return { success: false, error: '请选择公众号' };
    }

    const account = db.prepare('SELECT * FROM managed_accounts WHERE id = ?').get(accountId) as any;
    if (!account) {
      return { success: false, error: '公众号不存在' };
    }

    const { apiKey, apiBase, model } = getAIConfig();

    if (!apiKey) {
      return { success: false, error: '未配置 AI API，请在 .env 中设置 AI_API_KEY' };
    }

    // 获取该分类下的爆文数据作为参考
    const hotArticles = db.prepare(
      `SELECT a.title, am.read_num, am.like_num, a.extra_fields
       FROM articles a
       LEFT JOIN article_metadata am ON am.article_id = a.id
       WHERE a.fakeid IN (SELECT fakeid FROM mp_accounts WHERE category = ?)
       ORDER BY am.read_num DESC LIMIT 5`
    ).all(account.category || '') as any[];

    const hotRef = hotArticles.map(a => `- ${a.title}（阅读${a.read_num || '?'}）`).join('\n');

    const systemPrompt = `你是一位资深的微信公众号选题策划专家。
请根据公众号信息生成 5 个写作选题建议。

公众号名称：${account.name}
分类：${account.category || '综合'}
人设：${account.persona || '未设定'}
今日日期：${new Date().toLocaleDateString('zh-CN')}

参考该分类下的高阅读文章：
${hotRef || '暂无参考数据'}

【选题安全红线（必须严格遵守）】
- 涉及中国政治、政府、领导人、政策法规的选题，仅限正面宣传、成就展示、政策解读等政治正确方向
- 禁止涉及：政治批评、负面评论、敏感事件、社会争议、群体对立、民族宗教矛盾
- 禁止涉及：国际争端中对中国的负面描述、未经证实的社会传闻
- 如参考文章中有违反以上红线的标题，忽略该参考，不要生成类似选题
- 宁可选题保守，也绝不触碰政治敏感红线

请严格按以下 JSON 数组格式输出，不要包含任何其他内容：
[
  {"title": "选题标题", "angle": "核心角度", "viralPoint": "预计爆点"}
]`;

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.8,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: `AI API 调用失败 (${response.status})` };
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';

    // 解析 JSON
    try {
      const jsonMatch = reply.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const topics = JSON.parse(jsonMatch[0]) as TopicItem[];
        return { success: true, data: topics };
      }
    } catch {
      // 解析失败
    }

    return { success: false, error: 'AI 返回格式异常，请重试' };
  } catch (error) {
    console.error('Topic generation failed:', error);
    return { success: false, error: error instanceof Error ? error.message : '生成失败' };
  }
});

/**
 * 内容大纲生成 API
 * 根据每日话题选题 + 爆款写作模板，调用大模型生成结构化大纲
 */

import { getAIConfig } from '~/server/utils/ai-config';
import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { topicId, title, angle, viralPoint, category, styleFakeid } = body;

    // 兼容：支持直接传 title（手动输入）
    const topicTitle = title || '';
    if (!topicTitle) {
      return { success: false, error: '请选择或输入选题标题' };
    }

    const { apiKey, apiBase, model } = getAIConfig();

    if (!apiKey) {
      return { success: false, error: '未配置 AI，请在设置 → 模型配置中设置' };
    }

    // 从 article_analysis 表获取该分类下的爆款写作模板
    let templates = '';
    if (category) {
      const analysisRows = db
        .prepare(
          `SELECT title, reusable_template FROM article_analysis
           WHERE category = ? AND reusable_template IS NOT NULL AND reusable_template != ''
           ORDER BY created_at DESC LIMIT 3`
        )
        .all(category) as { title: string; reusable_template: string }[];

      if (analysisRows.length > 0) {
        templates = analysisRows
          .map((r, i) => `模板${i + 1}（来自《${r.title}》）：\n${r.reusable_template}`)
          .join('\n\n');
      }
    }

    // 从 topic_materials 表获取已搜集的素材
    let materialsText = '';
    if (topicId) {
      const materialRows = db
        .prepare('SELECT source, title, content FROM topic_materials WHERE topic_id = ?')
        .all(topicId) as { source: string; title: string; content: string }[];

      if (materialRows.length > 0) {
        const localMats = materialRows.filter(m => m.source === 'local');
        const webMats = materialRows.filter(m => m.source === 'web');
        const parts: string[] = [];

        if (localMats.length > 0) {
          parts.push('【本地文章库素材】');
          localMats.forEach((m, i) => {
            parts.push(`${i + 1}. ${m.title}\n${m.content}`);
          });
        }
        if (webMats.length > 0) {
          parts.push('【网络搜索素材】');
          webMats.forEach((m, i) => {
            parts.push(`${i + 1}. ${m.title}\n${m.content}`);
          });
        }
        materialsText = parts.join('\n\n');
      }
    }

    // 读取风格画像（如果指定了 styleFakeid 或按分类自动匹配）
    let styleConstraint = '';
    const targetFakeid = styleFakeid || '';
    let style: any = null;
    if (targetFakeid) {
      style = db
        .prepare('SELECT * FROM account_writing_styles WHERE fakeid = ? ORDER BY updated_at DESC LIMIT 1')
        .get(targetFakeid) as any;
    } else if (category) {
      style = db
        .prepare(`SELECT s.* FROM account_writing_styles s
                  JOIN mp_accounts m ON m.fakeid = s.fakeid
                  WHERE m.category = ?
                  ORDER BY s.updated_at DESC LIMIT 1`)
        .get(category) as any;
    }

    if (style) {
      const parts: string[] = [];
      if (style.persona_positioning) parts.push(`人格定位：${style.persona_positioning}`);

      // 深层写法特征（大纲阶段重点关注开篇和收束）
      if (style.deep_writing_traits) {
        try {
          const traits = JSON.parse(style.deep_writing_traits);
          if (traits.openingMethod) parts.push(`开篇偏好：${traits.openingMethod}`);
          if (traits.closingMethod) parts.push(`收束偏好：${traits.closingMethod}`);
        } catch { /* ignore */ }
      }

      // 禁忌清单
      if (style.taboos) {
        try {
          const taboos = JSON.parse(style.taboos) as string[];
          if (taboos.length) parts.push(`禁忌：${taboos.join('；')}`);
        } catch { /* ignore */ }
      }

      if (parts.length) {
        styleConstraint = `\n\n请参考以下写作风格来生成大纲：\n${parts.map(p => `- ${p}`).join('\n')}`;
      }
    }

    // 从 settings 表读取提示词（如有）
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('outline_prompt') as { value: string } | undefined;
    const systemPrompt = row?.value || `你是一位资深的微信公众号内容策划专家。请根据给定的选题信息和参考模板，生成一份结构化的内容大纲。

大纲要求：
1. 开篇引入：吸引读者注意力的开头方式
2. 核心段落：3-4 个关键论点或故事节点，每个附带素材建议
3. 金句建议：2-3 个适合在文中使用的金句
4. 结尾升华：点题并引导互动的结尾方式

请直接输出大纲内容，使用清晰的层级标题。`;

    // 构建用户提示
    let userPrompt = `选题标题：${topicTitle}`;
    if (angle) userPrompt += `\n核心角度：${angle}`;
    if (viralPoint) userPrompt += `\n预计爆点：${viralPoint}`;
    if (templates) userPrompt += `\n\n参考该分类下的爆款写作模板：\n${templates}`;
    if (materialsText) userPrompt += `\n\n以下是搜集到的相关素材，请在生成大纲时参考和利用：\n${materialsText}`;
    if (styleConstraint) userPrompt += styleConstraint;

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Outline API error:', response.status, errBody);
      return { success: false, error: `AI API 调用失败 (${response.status}): ${errBody.substring(0, 200)}` };
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';

    return { success: true, data: reply };
  } catch (error) {
    console.error('Outline generation failed:', error);
    return { success: false, error: error instanceof Error ? error.message : '生成失败' };
  }
});

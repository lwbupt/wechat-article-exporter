/**
 * 备选文章生成 API
 * 根据公众号人设、选题标题、大纲和素材，调用大模型生成完整备选文章
 */

import { getAIConfig } from '~/server/utils/ai-config';
import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { accountId, title, topicId, outline, styleFakeid } = body;

    if (!accountId || !title) {
      return { success: false, error: '请选择公众号并输入标题' };
    }

    const account = db.prepare('SELECT * FROM managed_accounts WHERE id = ?').get(accountId) as any;
    if (!account) {
      return { success: false, error: '公众号不存在' };
    }

    const { apiKey, apiBase, model } = getAIConfig();

    if (!apiKey) {
      return { success: false, error: '未配置 AI，请在设置 → 模型配置中设置' };
    }

    // 从 settings 表读取提示词（如有）
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('draft_prompt') as { value: string } | undefined;
    const basePrompt = row?.value || `你是一位资深的微信公众号撰稿人。请根据给定的公众号人设、选题信息和参考素材，撰写一篇完整的公众号文章。

写作要求：
1. 符合公众号的人设定位和写作风格
2. 标题吸引眼球，开头能快速抓住读者
3. 内容有深度，论点清晰，素材丰富
4. 适当使用金句和修辞手法
5. 结尾要有升华和互动引导
6. 文章长度 1500-2500 字
7. 充分利用提供的素材，不要凭空编造
8. 输出必须严格按照 Markdown 格式：
   - 文章标题使用一级标题（# 标题），且只能出现在文章开头
   - 正文中的段落标题使用二级标题（## 标题）
   - 不要使用三级及以下标题
   - 标题与正文之间空一行，确保层级结构清晰
9. 内容安全红线（严格遵守）：
   - 不得涉及政治敏感话题、国家领导人、政策批评、社会运动
   - 不得涉及色情、暴力、恐怖主义、毒品相关内容
   - 不得涉及虚假信息、谣言、未经证实的医疗建议
   - 不得使用侮辱性、歧视性、仇恨性语言
   - 涉及数据、引用时使用模糊化表述（如"某机构研究表明"而非具体机构名）
   - 遇到可能敏感的话题时，主动转换为中性、建设性的表达`;

    // 注入写作风格（优先用指定的 styleFakeid，其次按分类匹配）
    const targetFakeid = styleFakeid || '';
    let styleData: any = null;
    if (targetFakeid) {
      styleData = db
        .prepare('SELECT * FROM account_writing_styles WHERE fakeid = ? ORDER BY updated_at DESC LIMIT 1')
        .get(targetFakeid);
    } else if (account.category) {
      styleData = db
        .prepare(`SELECT s.* FROM account_writing_styles s
                  JOIN mp_accounts m ON m.fakeid = s.fakeid
                  WHERE m.category = ?
                  ORDER BY s.updated_at DESC LIMIT 1`)
        .get(account.category);
    }

    // 构建系统提示词：有风格数据时追加风格约束
    let systemPrompt = basePrompt;
    if (styleData) {
      const styleParts: string[] = [];

      if (styleData.persona_positioning) {
        styleParts.push(`## 你正在扮演的人格\n${styleData.persona_positioning}`);
      }

      if (styleData.oral_phrase_library) {
        try {
          const oral = JSON.parse(styleData.oral_phrase_library);
          const items: string[] = [];
          if (oral.transitions?.length) items.push(`- 转场：${oral.transitions.join('、')}`);
          if (oral.judgments?.length) items.push(`- 判断：${oral.judgments.join('、')}`);
          if (oral.selfDeprecation?.length) items.push(`- 自嘲：${oral.selfDeprecation.join('、')}`);
          if (oral.emotionalExpression?.length) items.push(`- 情绪：${oral.emotionalExpression.join('、')}`);
          if (oral.readerEngagement?.length) items.push(`- 读者：${oral.readerEngagement.join('、')}`);
          if (items.length) styleParts.push(`## 口语词组库（写作时自然地使用这些表达）\n${items.join('\n')}`);
        } catch { /* ignore */ }
      }

      if (styleData.taboos) {
        try {
          const taboos = JSON.parse(styleData.taboos) as string[];
          if (taboos.length) styleParts.push(`## 写作禁忌（绝对不要出现）\n${taboos.map(t => `- ${t}`).join('\n')}`);
        } catch { /* ignore */ }
      }

      if (styleData.surface_language) {
        try {
          const surface = JSON.parse(styleData.surface_language);
          const items: string[] = [];
          if (surface.sentenceRhythm) items.push(`- 句式节奏：${surface.sentenceRhythm}`);
          if (surface.wordFingerprint) items.push(`- 用词倾向：${surface.wordFingerprint}`);
          if (surface.punctuationHabits) items.push(`- 标点习惯：${surface.punctuationHabits}`);
          if (items.length) styleParts.push(`## 语言风格\n${items.join('\n')}`);
        } catch { /* ignore */ }
      }

      if (styleData.deep_writing_traits) {
        try {
          const traits = JSON.parse(styleData.deep_writing_traits);
          const items: string[] = [];
          if (traits.openingMethod) items.push(`- 开篇：${traits.openingMethod}`);
          if (traits.argumentProgression) items.push(`- 论述推进：${traits.argumentProgression}`);
          if (traits.knowledgeInsertion) items.push(`- 知识引入：${traits.knowledgeInsertion}`);
          if (traits.rhythmBreaking) items.push(`- 节奏打破：${traits.rhythmBreaking}`);
          if (traits.closingMethod) items.push(`- 收束：${traits.closingMethod}`);
          if (items.length) styleParts.push(`## 写法节奏\n${items.join('\n')}`);
        } catch { /* ignore */ }
      }

      if (styleData.sample_excerpts) {
        try {
          const excerpts = JSON.parse(styleData.sample_excerpts) as string[];
          if (excerpts.length) {
            styleParts.push(`## 参考范文（体会其节奏和呼吸感）\n${excerpts.map(e => `> ${e}`).join('\n\n')}`);
          }
        } catch { /* ignore */ }
      }

      if (styleParts.length) {
        systemPrompt += `\n\n---\n以下是你的写作风格DNA，请严格遵循：\n\n${styleParts.join('\n\n')}`;
      }
    }

    // 构建用户提示
    let userPrompt = `公众号名称：${account.name}
分类：${account.category || '综合'}
人设：${account.persona || '未设定'}
选题标题：${title}`;

    // 附加大纲
    if (outline) {
      userPrompt += `\n\n以下是内容大纲，请按此结构展开：\n${outline}`;
    }

    // 附加素材
    if (topicId) {
      const materialRows = db
        .prepare('SELECT source, title, content FROM topic_materials WHERE topic_id = ?')
        .all(topicId) as { source: string; title: string; content: string }[];

      if (materialRows.length > 0) {
        const parts = materialRows.map((m, i) => `${i + 1}. [${m.source === 'local' ? '本地' : '网络'}] ${m.title}\n${m.content}`);
        userPrompt += `\n\n以下是可用的素材：\n${parts.join('\n\n')}`;
      }
    }

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
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return { success: false, error: `AI API 调用失败 (${response.status}): ${errBody.substring(0, 200)}` };
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';

    // 保存到数据库
    const result = db.prepare(
      `INSERT INTO generated_articles (topic_id, account_id, title, outline, content, category)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      topicId || null,
      accountId,
      title,
      outline || null,
      reply,
      account.category || null,
    );

    return { success: true, data: reply, articleId: result.lastInsertRowid };
  } catch (error) {
    console.error('Draft generation failed:', error);
    return { success: false, error: error instanceof Error ? error.message : '生成失败' };
  }
});

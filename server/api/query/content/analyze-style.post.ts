/**
 * 公众号写作风格解析 API
 * 用户选择文章 → 读取内容 → 用风格逆向工程提示词分析 → 结构化存储
 */

import { getAIConfig } from '~/server/utils/ai-config';
import db from '~/server/database/index';

interface StyleResult {
  personaPositioning: string;
  surfaceLanguage: {
    sentenceRhythm: string;
    wordFingerprint: string;
    punctuationHabits: string;
    emotionalExpression: string;
  };
  oralPhraseLibrary: {
    transitions: string[];
    judgments: string[];
    selfDeprecation: string[];
    emotionalExpression: string[];
    readerEngagement: string[];
  };
  deepWritingTraits: {
    openingMethod: string;
    argumentProgression: string;
    knowledgeInsertion: string;
    rhythmBreaking: string;
    closingMethod: string;
  };
  taboos: string[];
  sampleExcerpts: string[];
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { articleIds } = body as { articleIds: number[] };

    if (!articleIds || articleIds.length < 1) {
      return { success: false, error: '请至少选择1篇文章' };
    }

    if (articleIds.length > 6) {
      return { success: false, error: '最多选择6篇文章' };
    }

    // 读取选中的文章
    const placeholders = articleIds.map(() => '?').join(',');
    const articles = db
      .prepare(
        `SELECT a.id, a.fakeid, a.title, a.content, a.digest, a.link,
                h.html_content
         FROM articles a
         LEFT JOIN article_html h ON h.article_id = a.id
         WHERE a.id IN (${placeholders}) AND a.is_deleted = 0`,
      )
      .all(...articleIds) as any[];

    if (articles.length === 0) {
      return { success: false, error: '未找到有效文章' };
    }

    // 取第一篇文章的 fakeid 确定公众号
    const fakeid = articles[0].fakeid;
    const account = db
      .prepare('SELECT fakeid, nickname, category FROM mp_accounts WHERE fakeid = ?')
      .get(fakeid) as { fakeid: string; nickname: string; category: string } | undefined;
    if (!account) {
      return { success: false, error: '公众号不存在' };
    }

    const { apiKey, apiBase, model } = getAIConfig();
    if (!apiKey) {
      return { success: false, error: '未配置 AI，请在设置 → 模型配置中设置' };
    }

    // 提取每篇文章的纯文本
    const articleTexts = articles.map(art => {
      let text = '';
      if (art.html_content) {
        text = extractText(art.html_content);
      }
      if (text.length < 50 && art.content) {
        text = (text || '') + extractText(art.content);
      }
      if (text.length < 50) {
        const parts = [art.title, art.content, art.digest].filter(Boolean);
        text = parts.join('\n\n');
      }
      return { title: art.title || '', text };
    }).filter(a => a.text.length >= 20);

    if (articleTexts.length < 1) {
      return { success: false, error: '选中文章的有效内容不足，请确保已下载过文章内容' };
    }

    // 拼接文章内容
    const allContent = articleTexts
      .map((a, i) => `--- 文章${i + 1}: ${a.title} ---\n${a.text.substring(0, 3000)}`)
      .join('\n\n');

    // 从 settings 表读取用户自定义提示词
    const promptRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('style_analysis_prompt') as { value: string } | undefined;
    const userPrompt = promptRow?.value || getDefaultPrompt();

    console.log(`[StyleAnalysis] Analyzing ${articleTexts.length} articles for ${account.nickname}, contentLen=${allContent.length}`);

    // 构建要求 JSON 输出的指令追加到提示词末尾
    const jsonInstruction = `

请在分析完成后，将结果以如下 JSON 格式输出（附在 Markdown 分析之后）：

\`\`\`json
{
  "personaPositioning": "人格定位，2-3句话",
  "surfaceLanguage": {
    "sentenceRhythm": "句式节奏结论",
    "wordFingerprint": "用词倾向结论",
    "punctuationHabits": "标点习惯结论",
    "emotionalExpression": "情绪表达结论"
  },
  "oralPhraseLibrary": {
    "transitions": ["转场过渡口头语1", "口头语2"],
    "judgments": ["判断说法1", "说法2"],
    "selfDeprecation": ["自嘲表达1", "表达2"],
    "emotionalExpression": ["情绪用语1", "用语2"],
    "readerEngagement": ["读者对话表达1", "表达2"]
  },
  "deepWritingTraits": {
    "openingMethod": "开篇方式",
    "argumentProgression": "论述推进方式",
    "knowledgeInsertion": "知识引入方式",
    "rhythmBreaking": "论述打破方式",
    "closingMethod": "收束方式"
  },
  "taboos": ["禁忌1", "禁忌2"],
  "sampleExcerpts": ["范文摘录段落1", "段落2"]
}
\`\`\``;

    const resp = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: userPrompt + jsonInstruction },
          { role: 'user', content: `公众号名称：${account.nickname}\n分析文章数：${articleTexts.length}\n\n# 我的文章样本\n\n${allContent.substring(0, 30000)}` },
        ],
        temperature: 0.5,
        max_tokens: 6000,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { success: false, error: `风格分析 API 调用失败 (${resp.status}): ${errText.substring(0, 200)}` };
    }

    const respData = await resp.json();
    const reply = respData.choices?.[0]?.message?.content || '';

    // 从回复中提取 JSON
    let styleResult: StyleResult;
    try {
      // 尝试多种方式提取 JSON
      let jsonStr = '';

      // 1. 尝试从 ```json ... ``` 代码块中提取
      const codeBlockMatch = reply.match(/```json\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      }

      // 2. 尝试找最后一个完整的 { ... } 对象（包含 personaPositioning）
      if (!jsonStr) {
        const allBraces: { start: number; end: number }[] = [];
        let searchFrom = 0;
        while (true) {
          const startIdx = reply.indexOf('{', searchFrom);
          if (startIdx === -1) break;
          // 找匹配的 }
          let depth = 0;
          let endIdx = -1;
          for (let i = startIdx; i < reply.length; i++) {
            if (reply[i] === '{') depth++;
            else if (reply[i] === '}') {
              depth--;
              if (depth === 0) { endIdx = i + 1; break; }
            }
          }
          if (endIdx > 0) {
            const candidate = reply.substring(startIdx, endIdx);
            if (candidate.includes('personaPositioning')) {
              allBraces.push({ start: startIdx, end: endIdx });
            }
          }
          searchFrom = startIdx + 1;
        }
        if (allBraces.length > 0) {
          // 取最后一个匹配
          const last = allBraces[allBraces.length - 1];
          jsonStr = reply.substring(last.start, last.end);
        }
      }

      if (!jsonStr) {
        throw new Error('No JSON found in response');
      }

      styleResult = JSON.parse(jsonStr) as StyleResult;
    } catch (parseErr) {
      console.error('[StyleAnalysis] Failed to parse JSON from:', reply.substring(0, 500));
      return { success: false, error: 'AI 返回格式异常，请重试' };
    }

    // 提取 Markdown 部分（JSON 代码块之前的内容）
    const markdownResult = reply.replace(/```json[\s\S]*?```/, '').trim();

    // 保存风格画像（覆盖旧记录）
    const existing = db
      .prepare('SELECT id FROM account_writing_styles WHERE fakeid = ?')
      .get(fakeid) as { id: number } | undefined;

    const personaPositioning = styleResult.personaPositioning || '';
    const surfaceLanguage = JSON.stringify(styleResult.surfaceLanguage || {});
    const oralPhraseLibrary = JSON.stringify(styleResult.oralPhraseLibrary || {});
    const deepWritingTraits = JSON.stringify(styleResult.deepWritingTraits || {});
    const taboos = JSON.stringify(styleResult.taboos || []);
    const sampleExcerpts = JSON.stringify(styleResult.sampleExcerpts || []);
    const sourceArticleIds = JSON.stringify(articleIds);

    let styleId: number;
    if (existing) {
      db.prepare(
        `UPDATE account_writing_styles SET
          account_name = ?, persona_positioning = ?, surface_language = ?,
          oral_phrase_library = ?, deep_writing_traits = ?, taboos = ?,
          sample_excerpts = ?, source_article_ids = ?, article_count = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE fakeid = ?`,
      ).run(
        account.nickname, personaPositioning, surfaceLanguage,
        oralPhraseLibrary, deepWritingTraits, taboos,
        sampleExcerpts, sourceArticleIds, articleTexts.length,
        fakeid,
      );
      styleId = existing.id;
    } else {
      const result = db.prepare(
        `INSERT INTO account_writing_styles (
          fakeid, account_name, persona_positioning, surface_language,
          oral_phrase_library, deep_writing_traits, taboos,
          sample_excerpts, source_article_ids, article_count
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        fakeid, account.nickname, personaPositioning, surfaceLanguage,
        oralPhraseLibrary, deepWritingTraits, taboos,
        sampleExcerpts, sourceArticleIds, articleTexts.length,
      );
      styleId = Number(result.lastInsertRowid);
    }

    console.log(`[StyleAnalysis] Done. Style saved (id=${styleId})`);

    return {
      success: true,
      data: {
        accountName: account.nickname,
        articleCount: articleTexts.length,
        markdown: markdownResult,
        style: styleResult,
      },
    };
  } catch (error) {
    console.error('Style analysis failed:', error);
    return { success: false, error: error instanceof Error ? error.message : '分析失败' };
  }
});

/**
 * 默认风格分析提示词
 */
function getDefaultPrompt(): string {
  return `# 角色

你是一位风格逆向工程师。我会给你1-5篇我写过的文章，你要像语言学侦探一样，从文字中还原我的写作DNA，不是分析"写了什么"，而是拆解"这个人是怎么写东西的"。

# 任务

分析我的文章样本，输出一份结构化的「风格提示词」。让另一个AI拿到这份提示词后，写出来的东西一眼就像我写的。

# 分析维度

逐层拆解以下维度，每一层的结论都要落入最终输出。

## 维度一，表层语言特征
- 句式节奏，短句和长句的比例，标志性句式
- 用词指纹，口语/书面/网络用语的混合比例，个人高频词
- 标点习惯，省略号、感叹号、问号的使用频率和非常规用法
- 段落节奏，平均段长，是否有一句话独立成段的习惯

## 维度二，口语词组库提取
从原文中逐字提取20-30个口语表达，按5类分组，
- 转场过渡（话题切换时的口头语）
- 表达判断（下结论时的个人化说法）
- 承认自嘲（示弱、不确定的表达）
- 情绪表达（传递情绪态度的用语）
- 拉近读者（与读者对话的表达）

铁律，必须从原文逐字提取，禁止AI编造或归纳改写。每类至少4个。

## 维度三，深层写法特征
- 开篇方式，怎么起
- 论述推进，怎么展开，是否有升番逻辑（一轮比一轮更强）
- 知识引入，随手嵌入叙事 vs 停下来专门讲解
- 论述打破，中间是否突然跑题、自嘲、吐槽来打破节奏
- 收束方式，怎么结尾，是升华还是戛然而止

## 维度四，禁忌推断
从文章中反推这个人绝对不会怎么写，列出5-8条具体禁忌。

# 输出格式

严格按以下结构输出，

---
## 人格定位
[2-3句话，这是什么样的人，用什么姿态写文章，和读者什么关系]

## 语言特征
- 句式节奏，[结论]
- 用词倾向，[结论]
- 标点习惯，[结论]
- 情绪表达，[结论]

## 口语词组库
**转场过渡**，[逗号分隔]
**表达判断**，[逗号分隔]
**承认自嘲**，[逗号分隔]
**情绪表达**，[逗号分隔]
**拉近读者**，[逗号分隔]

## 写法特征
- 开篇方式，[结论]
- 论述推进，[结论]
- 知识引入，[结论]
- 收束方式，[结论]

## 禁忌清单
- [具体禁忌1]
- [具体禁忌2]
...

## 范文摘录
> [从原文中摘录1-2段最能代表风格的段落，逐字摘录，不可改写]

---

# 我的文章样本
[选择的文章将自动附加在下方]`;
}

/**
 * 提取纯文本
 */
function extractText(htmlOrText: string): string {
  if (!htmlOrText) return '';
  if (!htmlOrText.includes('<')) return htmlOrText;

  let text = htmlOrText.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  const contentMatch = text.match(/id="js_content"[\s\S]*?>([\s\S]*?)<\/div>/i);
  if (contentMatch) text = contentMatch[1];
  text = text.replace(/<[^>]+>/g, '\n');
  text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

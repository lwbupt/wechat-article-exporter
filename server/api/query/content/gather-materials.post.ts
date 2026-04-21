/**
 * 素材搜集 API（升级版）
 * 流程：
 *   步骤0：跨账号素材复用（按选题标题关键词匹配，重合度≥60%才复用）
 *   步骤1：AI 生成多角度搜索词
 *   步骤2：多角度本地搜索 + Tavily 网络搜索
 *   步骤3：AI 质量筛选 → 去重入库
 */

import { getAIConfig } from '~/server/utils/ai-config';
import db from '~/server/database/index';

interface MaterialItem {
  source: string;
  title: string;
  content: string;
  url: string;
  category: string;
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { topicId, title, category, angle, viralPoint } = body;

    if (!topicId || !title) {
      return { success: false, error: '缺少选题信息' };
    }

    const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
    let materials: MaterialItem[] = [];
    let searchQueries: string[] = [];

    // ========== 预检：探测各本地源的数据量 ==========
    const localStats = getLocalSourceStats();
    const aiConfig = getAIConfig();
    console.log(`[Material] Local stats: articles=${localStats.articles}, analysis=${localStats.analysis}, writingMaterials=${localStats.writingMaterials}`);

    // ========== 步骤 0：跨账号素材复用（按选题相关性） ==========
    const reusable = tryReuseMaterials(topicId, title, category);
    if (reusable) {
      materials = reusable;
      searchQueries = ['(复用素材)'];
      console.log(`[Material] Reused ${materials.length} materials from similar topic`);
    }

    if (materials.length === 0) {
    // ========== 步骤 1：AI 生成多角度搜索词（仅在有充足本地数据时启用） ==========

    // 本地数据太少时，不浪费 AI 调用做搜索词生成——直接用原标题关键词搜
    const localDataSufficient = localStats.articles > 50;
    if (aiConfig.apiKey && localDataSufficient) {
      try {
        searchQueries = await generateSearchQueries(aiConfig, title, angle, viralPoint, category);
        console.log(`[Material] AI generated ${searchQueries.length} search queries:`, searchQueries);
      } catch (err) {
        console.error('[Material] AI search query generation failed, fallback to keywords:', err);
      }
    }

    // 降级：用标题直接提取关键词
    if (searchQueries.length === 0) {
      const keywords = extractKeywords(title);
      searchQueries = keywords.length > 0 ? [keywords.join(' ')] : [title];
    }

    // ========== 步骤 2：本地搜索（按数据量自适应） ==========
    for (const query of searchQueries) {
      const keywords = extractKeywords(query);
      if (keywords.length === 0) continue;

      // articles 表数据充足时用 AND+OR 组合，数据少时只用 OR（避免 AND 搜不到）
      if (localStats.articles > 100) {
        materials.push(...searchLocalArticlesAnd(keywords, category, oneWeekAgo));
      }
      materials.push(...searchLocalArticles(keywords, category, oneWeekAgo));

      // 爆文分析和素材库只在有数据时才搜
      if (localStats.analysis > 0) {
        materials.push(...searchAnalysisMaterials(keywords, category, oneWeekAgo));
      }
      if (localStats.writingMaterials > 0) {
        materials.push(...searchWritingMaterials(keywords, category, oneWeekAgo));
      }
    }

    // 本地结果太少时放宽时间范围，搜最近 90 天
    if (materials.length < 3) {
      console.log('[Material] Too few results with 7-day range, expanding to 90 days');
      const ninetyDaysAgo = Math.floor(Date.now() / 1000) - 90 * 86400;
      for (const query of searchQueries.slice(0, 2)) {
        // 只用前 2 个查询避免重复太多
        const keywords = extractKeywords(query);
        if (keywords.length === 0) continue;
        materials.push(...searchLocalArticles(keywords, category, ninetyDaysAgo));
      }
    }

    // ========== 步骤 3：Tavily 网络搜索（自适应查询数） ==========
    const tavilyKey = process.env.TAVILY_API_KEY || '';
    if (tavilyKey) {
      // 本地素材已经充足时只搜 1-2 个查询做补充；不足时搜全部查询
      const tavilyQueryCount = materials.length >= 5 ? Math.min(2, searchQueries.length) : searchQueries.length;
      for (const query of searchQueries.slice(0, tavilyQueryCount)) {
        try {
          const webResults = await searchTavily(tavilyKey, query);
          materials.push(...webResults);
        } catch (err) {
          console.error(`[Material] Tavily search failed for "${query}":`, err);
        }
      }
    }
    } // end of if (materials.length === 0)

    // ========== 步骤 4：去重 + 敏感词预过滤 ==========
    const deduped = dedupMaterials(materials).filter(m => !isSensitiveContent(m.title + ' ' + m.content));
    console.log(`[Material] Before dedup: ${materials.length}, after: ${deduped.length}`);

    // ========== 步骤 5：AI 质量筛选（素材太少时跳过） ==========
    let filtered = deduped;
    if (aiConfig.apiKey && deduped.length > 5) {
      try {
        filtered = await filterByRelevance(aiConfig, deduped, title, angle, viralPoint);
        console.log(`[Material] After AI filter: ${deduped.length} → ${filtered.length}`);
      } catch (err) {
        console.error('[Material] AI quality filter failed, keeping all:', err);
      }
    }

    // ========== 步骤 6：存入数据库 ==========
    db.prepare('DELETE FROM topic_materials WHERE topic_id = ?').run(topicId);

    const insertStmt = db.prepare(
      `INSERT INTO topic_materials (topic_id, source, title, content, url, category)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    const insertAll = db.transaction(() => {
      for (const m of filtered) {
        insertStmt.run(topicId, m.source, m.title, m.content.substring(0, 2000), m.url, m.category);
      }
    });
    insertAll();

    const localCount = filtered.filter(m => m.source === 'local').length;
    const webCount = filtered.filter(m => m.source === 'web').length;

    return {
      success: true,
      data: { total: filtered.length, local: localCount, web: webCount, queries: searchQueries },
    };
  } catch (error) {
    console.error('Gather materials failed:', error);
    return { success: false, error: error instanceof Error ? error.message : '搜集失败' };
  }
});

// ========== 跨账号素材复用（按选题相关性） ==========

function tryReuseMaterials(currentTopicId: number, title: string, category?: string): MaterialItem[] | null {
  const titleKeywords = extractKeywords(title);
  if (titleKeywords.length === 0) return null;

  try {
    // 查找其他工作流已收集过素材的、且已完成素材阶段的选题
    const candidateRows = db.prepare(`
      SELECT DISTINCT tm.topic_id, dt.title
      FROM topic_materials tm
      JOIN daily_topics dt ON dt.id = tm.topic_id
      JOIN article_workflow aw ON aw.topic_id = tm.topic_id
      WHERE tm.topic_id != ?
        AND aw.material_status = 'done'
        AND dt.category = ?
      ORDER BY tm.created_at DESC
      LIMIT 20
    `).all(currentTopicId, category || '') as { topic_id: number; title: string }[];

    let bestMatchTopicId: number | null = null;
    let bestOverlap = 0;

    for (const row of candidateRows) {
      const candidateKeywords = extractKeywords(row.title);
      if (candidateKeywords.length === 0) continue;

      // 计算关键词重合度
      const candidateSet = new Set(candidateKeywords);
      const overlapCount = titleKeywords.filter(k => candidateSet.has(k)).length;
      const overlapRatio = overlapCount / Math.max(titleKeywords.length, candidateKeywords.length);

      // 至少 60% 关键词匹配
      if (overlapRatio >= 0.6 && overlapCount > bestOverlap) {
        bestOverlap = overlapCount;
        bestMatchTopicId = row.topic_id;
      }
    }

    if (!bestMatchTopicId) return null;

    // 取出该选题的素材
    const rows = db.prepare(
      'SELECT source, title, content, url, category FROM topic_materials WHERE topic_id = ? ORDER BY id ASC'
    ).all(bestMatchTopicId) as { source: string; title: string; content: string; url: string; category: string }[];

    if (rows.length === 0) return null;

    console.log(`[Material] Found reusable materials from topic_id=${bestMatchTopicId}, keywords overlap=${bestOverlap}`);
    return rows.map(r => ({
      source: r.source,
      title: r.title,
      content: r.content || '',
      url: r.url || '',
      category: r.category || category || '',
    }));
  } catch (err) {
    console.error('[Material] Reuse check failed:', err);
    return null;
  }
}

// ========== 本地数据量探测 ==========

function getLocalSourceStats(): { articles: number; analysis: number; writingMaterials: number } {
  const stats = { articles: 0, analysis: 0, writingMaterials: 0 };
  try {
    stats.articles = ((db.prepare('SELECT COUNT(*) as c FROM articles').get() as { c: number }).c) || 0;
  } catch { /* 表不存在 */ }
  try {
    stats.analysis = ((db.prepare('SELECT COUNT(*) as c FROM article_analysis').get() as { c: number }).c) || 0;
  } catch { /* 表不存在 */ }
  try {
    stats.writingMaterials = ((db.prepare('SELECT COUNT(*) as c FROM writing_materials').get() as { c: number }).c) || 0;
  } catch { /* 表不存在 */ }
  return stats;
}

// ========== AI 搜索词生成 ==========

async function generateSearchQueries(
  aiConfig: { apiKey: string; apiBase: string; model: string },
  title: string,
  angle?: string,
  viralPoint?: string,
  category?: string,
): Promise<string[]> {
  let prompt = `你是一个搜索专家。根据以下选题信息，生成 5 个精准的网络搜索查询词（每个不超过20字），覆盖不同角度（如：事件本身、数据支撑、案例故事、对立观点、历史对比）。\n\n选题：${title}`;
  if (angle) prompt += `\n分析角度：${angle}`;
  if (viralPoint) prompt += `\n爆点：${viralPoint}`;
  if (category) prompt += `\n领域：${category}`;
  prompt += '\n\n输出格式（每行一个搜索词，不要编号、不要额外解释）：';

  const response = await fetch(`${aiConfig.apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: aiConfig.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API failed (${response.status})`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content || '';

  // 解析每行作为一个搜索词
  const queries = text
    .split('\n')
    .map(l => l.replace(/^\d+[\.\、\)\]]\s*/, '').trim()) // 去掉 "1. " "1、" 等
    .filter(l => l.length >= 2 && l.length <= 30);

  return queries.slice(0, 5);
}

// ========== AI 质量筛选 ==========

async function filterByRelevance(
  aiConfig: { apiKey: string; apiBase: string; model: string },
  materials: MaterialItem[],
  title: string,
  angle?: string,
  viralPoint?: string,
): Promise<MaterialItem[]> {
  // 构建评分 prompt
  const MAX_SUMMARY_LEN = 300;
  const materialList = materials
    .map((m, i) => {
      const summary = m.content.substring(0, MAX_SUMMARY_LEN);
      return `${i + 1}. [${m.source === 'local' ? '本地' : '网络'}] ${m.title} | ${summary}`;
    })
    .join('\n');

  let prompt = `你是一个素材质量评审专家。请对以下素材与选题的相关性打分（1-10分），同时识别敏感内容。

选题：${title}`;
  if (angle) prompt += `\n分析角度：${angle}`;
  if (viralPoint) prompt += `\n爆点：${viralPoint}`;

  prompt += `\n\n素材列表（共${materials.length}条）：
${materialList}

评分标准：
- 8-10分：直接相关，核心事实/数据/观点
- 5-7分：间接相关，提供背景或佐证
- 1-4分：不相关或仅有字面匹配
- 0分：涉及敏感内容（政治敏感、色情暴力、虚假信息、仇恨歧视、恐怖主义、毒品等）

敏感内容判定（打0分）：
- 涉及政治敏感话题、国家领导人、政策批评、社会运动
- 涉及色情、暴力、恐怖主义、毒品相关内容
- 涉及虚假信息、谣言、未经证实的医疗建议
- 使用侮辱性、歧视性、仇恨性语言

输出格式（每行一个分数，严格按顺序，不要编号不要额外文字）：
10
7
0
3
...`;

  const response = await fetch(`${aiConfig.apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: aiConfig.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI scoring failed (${response.status})`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content || '';

  // 解析分数
  const scores = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^\d+$/.test(l))
    .map(Number);

  if (scores.length === 0) {
    console.warn('[Material] AI returned no valid scores, keeping all materials');
    return materials.slice(0, 10);
  }

  // 按分数过滤和排序
  const scored = materials.map((m, i) => ({
    material: m,
    score: i < scores.length ? scores[i] : 5, // 没有分数的给中等分
  }));

  // 过滤：剔除敏感内容（0分）+ 不相关（<6分），按分数降序，最多保留 10 条
  const filtered = scored
    .filter(s => s.score >= 6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(s => s.material);

  return filtered;
}

// ========== 关键词提取 ==========

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上',
    '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
    '他', '她', '它', '们', '那', '被', '从', '对', '让', '把', '给', '与', '而', '但', '如',
    '因', '为', '所', '之', '以', '及', '等', '中', '或', '更', '还', '将', '能', '可', '该',
    '已', '什么', '怎么', '如何', '为什么', '哪些', '这个', '那个', '可以', '应该', '需要',
    '没有', '通过', '进行', '成为', '已经', '以及', '不是', '可能', '就是', '这样', '那样',
  ]);
  const words = text
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stopWords.has(w));
  return words.length > 0 ? words : [text.substring(0, 6)];
}

// ========== 去重 ==========

function dedupMaterials(materials: MaterialItem[]): MaterialItem[] {
  const seen = new Set<string>();
  const result: MaterialItem[] = [];

  for (const m of materials) {
    // 用标题 + 内容前100字作为去重 key
    const key = `${m.title}||${m.content.substring(0, 100)}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(m);
    }
  }

  return result;
}

// ========== 本地搜索：AND 条件（所有关键词同时匹配） ==========

function searchLocalArticlesAnd(keywords: string[], category?: string, since?: number): MaterialItem[] {
  if (keywords.length === 0) return [];

  const results: MaterialItem[] = [];

  // AND 条件：所有关键词必须出现在标题或摘要中
  const titleAnd = keywords.map(() => `title LIKE ?`).join(' AND ');
  const digestAnd = keywords.map(() => `digest LIKE ?`).join(' AND ');
  const likeParams = keywords.map(k => `%${k}%`);

  let sql = `SELECT title, digest, author_name, link FROM articles WHERE (${titleAnd}) OR (${digestAnd})`;
  const params = [...likeParams, ...likeParams];

  if (category) {
    sql += ` AND fakeid IN (SELECT fakeid FROM mp_accounts WHERE category = ?)`;
    params.push(category);
  }
  if (since) {
    sql += ` AND datetime >= ?`;
    params.push(since);
  }

  sql += ` ORDER BY datetime DESC LIMIT 5`;

  try {
    const rows = db.prepare(sql).all(...params) as { title: string; digest: string; author_name: string; link: string }[];
    for (const row of rows) {
      results.push({
        source: 'local',
        title: row.title,
        content: row.digest || '',
        url: row.link || '',
        category: category || '',
      });
    }
  } catch {
    // 查询失败静默
  }

  return results;
}

// ========== 本地搜索：OR 条件（任一关键词匹配） ==========

function searchLocalArticles(keywords: string[], category?: string, since?: number): MaterialItem[] {
  const results: MaterialItem[] = [];

  const titleConditions = keywords.map(() => `title LIKE ?`).join(' OR ');
  const digestConditions = keywords.map(() => `digest LIKE ?`).join(' OR ');
  const likeParams = keywords.map(k => `%${k}%`);

  let sql = `SELECT title, digest, author_name, link FROM articles WHERE (${titleConditions}) OR (${digestConditions})`;
  const params = [...likeParams, ...likeParams];

  if (category) {
    sql += ` AND fakeid IN (SELECT fakeid FROM mp_accounts WHERE category = ?)`;
    params.push(category);
  }
  if (since) {
    sql += ` AND datetime >= ?`;
    params.push(since);
  }

  sql += ` ORDER BY datetime DESC LIMIT 5`;

  try {
    const rows = db.prepare(sql).all(...params) as { title: string; digest: string; author_name: string; string; link: string }[];
    for (const row of rows) {
      results.push({
        source: 'local',
        title: row.title,
        content: row.digest || '',
        url: row.link || '',
        category: category || '',
      });
    }
  } catch {
    // 查询失败静默
  }

  return results;
}

// ========== 爆文分析搜索 ==========

function searchAnalysisMaterials(keywords: string[], category?: string, since?: number): MaterialItem[] {
  const results: MaterialItem[] = [];

  const titleConditions = keywords.map(() => `title LIKE ?`).join(' OR ');
  const gsConditions = keywords.map(() => `golden_sentences LIKE ?`).join(' OR ');
  const likeParams = keywords.map(k => `%${k}%`);

  let sql = `SELECT title, golden_sentences, viral_elements, writing_techniques FROM article_analysis WHERE (${titleConditions}) OR (${gsConditions})`;
  const params = [...likeParams, ...likeParams];

  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }
  if (since) {
    sql += ` AND created_at >= datetime(?, 'unixepoch')`;
    params.push(since);
  }

  sql += ` ORDER BY created_at DESC LIMIT 3`;

  try {
    const rows = db.prepare(sql).all(...params) as { title: string; golden_sentences: string; viral_elements: string; writing_techniques: string }[];
    for (const row of rows) {
      const parts: string[] = [];
      if (row.golden_sentences) parts.push(`金句：${row.golden_sentences}`);
      if (row.viral_elements) parts.push(`爆款要素：${row.viral_elements}`);
      if (row.writing_techniques) parts.push(`写作手法：${row.writing_techniques}`);

      results.push({
        source: 'local',
        title: `[爆文分析] ${row.title}`,
        content: parts.join('\n'),
        url: '',
        category: category || '',
      });
    }
  } catch {
    // 查询失败静默
  }

  return results;
}

// ========== 素材库搜索 ==========

function searchWritingMaterials(keywords: string[], category?: string, since?: number): MaterialItem[] {
  const results: MaterialItem[] = [];

  const contentConditions = keywords.map(() => `content LIKE ?`).join(' OR ');
  const tagsConditions = keywords.map(() => `tags LIKE ?`).join(' OR ');
  const likeParams = keywords.map(k => `%${k}%`);

  let sql = `SELECT content, type, tags, source_type, category FROM writing_materials WHERE (${contentConditions}) OR (${tagsConditions})`;
  const params = [...likeParams, ...likeParams];

  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }
  if (since) {
    sql += ` AND created_at >= datetime(?, 'unixepoch')`;
    params.push(since);
  }

  sql += ` ORDER BY created_at DESC LIMIT 3`;

  try {
    const rows = db.prepare(sql).all(...params) as { content: string; type: string; tags: string; source_type: string; category: string }[];
    const typeLabels: Record<string, string> = {
      golden_sentence: '金句',
      opening: '好开头',
      closing: '好结尾',
      case_study: '案例',
      data_point: '数据',
      analogy: '类比',
      transition: '过渡句',
      quote: '名言',
    };
    for (const row of rows) {
      results.push({
        source: 'local',
        title: `[素材库·${typeLabels[row.type] || row.type}]${row.tags ? ` ${row.tags}` : ''}`,
        content: row.content,
        url: '',
        category: row.category || category || '',
      });
    }
  } catch {
    // 查询失败静默
  }

  return results;
}

// ========== Tavily 网络搜索 ==========

async function searchTavily(apiKey: string, query: string): Promise<MaterialItem[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      max_results: 3,
      include_answer: true,
      time_range: 'week',
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily API failed (${response.status})`);
  }

  const data = (await response.json()) as {
    answer?: string;
    results?: { title: string; url: string; content: string }[];
  };

  const results: MaterialItem[] = [];

  if (data.answer) {
    results.push({
      source: 'web',
      title: `[AI 综合摘要] ${query}`,
      content: data.answer,
      url: '',
      category: '',
    });
  }

  if (data.results) {
    for (const r of data.results) {
      results.push({
        source: 'web',
        title: r.title,
        content: r.content,
        url: r.url,
        category: '',
      });
    }
  }

  return results;
}

// ========== 敏感内容预过滤 ==========

function isSensitiveContent(text: string): boolean {
  const sensitiveKeywords = [
    // 政治敏感
    '六四', '天安门事件', '法轮功', '藏独', '疆独', '台独',
    '颜色革命', '政变', '推翻政府', '反党', '反华',
    // 暴力恐怖
    '恐怖袭击', '爆炸装置', '自制炸弹', 'ISIS', '基地组织',
    // 色情
    '色情视频', '裸聊', '卖淫',
    // 毒品
    '毒品制作', '吸毒方法', '贩毒',
    // 虚假信息
    '秘方根治', '包治百病', '祖传秘方',
  ];
  const lower = text.toLowerCase();
  return sensitiveKeywords.some(kw => lower.includes(kw.toLowerCase()));
}

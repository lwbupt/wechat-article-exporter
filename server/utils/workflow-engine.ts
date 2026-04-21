/**
 * 文章生成工作流引擎
 * 串联：选题 → 素材 → 正文 → 配图 → 排版 → 推送
 * 支持按阶段续跑，已完成的阶段跳过
 */

import { getAIConfig } from './ai-config';
import db from '~/server/database/index';

// ========== 阶段定义 ==========

const STAGES = ['topic', 'material', 'draft', 'image', 'layout', 'push'] as const;
type Stage = (typeof STAGES)[number];

const STAGES_LABELS: Record<string, string> = {
  topic: '选题', material: '素材', draft: '正文', image: '配图', layout: '排版', push: '推送',
};

// ========== 运行锁（防止同一 workflow 并发执行）==========

const runningLocks = new Set<number>();

function acquireLock(workflowId: number): boolean {
  if (runningLocks.has(workflowId)) return false;
  runningLocks.add(workflowId);
  return true;
}

function releaseLock(workflowId: number) {
  runningLocks.delete(workflowId);
}

// ========== 运行日志 ==========

interface LogEntry {
  stage: string;
  event: string;
  time: string;
  detail?: string;
}

function appendLog(workflowId: number, stage: string, event: string, detail?: string) {
  try {
    const row = db.prepare('SELECT run_log FROM article_workflow WHERE id = ?').get(workflowId) as { run_log: string | null } | undefined;
    const logs: LogEntry[] = row?.run_log ? JSON.parse(row.run_log) : [];
    logs.push({ stage, event, time: new Date().toISOString(), detail });
    db.prepare('UPDATE article_workflow SET run_log = ? WHERE id = ?').run(JSON.stringify(logs), workflowId);
  } catch {
    // 日志写入失败不影响主流程
  }
}

// ========== 内部 HTTP 调用工具 ==========

const NITRO_PORT = process.env.NITRO_PORT || 3000;

async function callLocalAPI(path: string, body: any, timeoutMs = 120_000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`http://localhost:${NITRO_PORT}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const result = (await resp.json()) as any;
    if (!resp.ok || result.success === false) {
      throw new Error(result.error || `API ${path} failed (${resp.status})`);
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

// ========== 工作流 CRUD ==========

export function createWorkflow(accountId: number, category: string, date?: string): number {
  const workflowDate = date || new Date().toISOString().split('T')[0];
  const result = db
    .prepare(
      `INSERT INTO article_workflow (account_id, category, workflow_date, status)
       VALUES (?, ?, ?, 'pending')`,
    )
    .run(accountId, category, workflowDate);
  return Number(result.lastInsertRowid);
}

export function getWorkflow(id: number) {
  return db.prepare('SELECT * FROM article_workflow WHERE id = ?').get(id) as any;
}

export function listWorkflows(options: { date?: string; status?: string; accountId?: number }) {
  const conditions: string[] = [];
  const params: any[] = [];

  if (options.date) {
    conditions.push('workflow_date = ?');
    params.push(options.date);
  }
  if (options.status) {
    conditions.push('status = ?');
    params.push(options.status);
  }
  if (options.accountId) {
    conditions.push('account_id = ?');
    params.push(options.accountId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return db
    .prepare(`SELECT w.*, m.name as account_name FROM article_workflow w LEFT JOIN managed_accounts m ON m.id = w.account_id ${where} ORDER BY w.created_at DESC`)
    .all(...params) as any[];
}

function updateStage(workflowId: number, stage: Stage, status: string, error?: string) {
  const now = new Date().toISOString();
  const statusCol = `${stage}_status`;
  const errorCol = `${stage}_error`;
  const atCol = `${stage}_at`;

  // 记录运行日志
  const stageLabel = STAGES_LABELS[stage] || stage;
  if (status === 'running') {
    appendLog(workflowId, stage, 'start', `${stageLabel}阶段开始执行`);
  } else if (status === 'done') {
    appendLog(workflowId, stage, 'done', `${stageLabel}阶段完成`);
  } else if (status === 'error') {
    appendLog(workflowId, stage, 'error', `${stageLabel}阶段失败: ${error || ''}`);
  } else if (status === 'skipped') {
    appendLog(workflowId, stage, 'skipped', `${stageLabel}阶段跳过: ${error || ''}`);
  }

  if (status === 'running') {
    db.prepare(`UPDATE article_workflow SET ${statusCol} = ?, ${atCol} = ?, status = 'running', updated_at = ? WHERE id = ?`).run(status, now, now, workflowId);
  } else if (status === 'done') {
    db.prepare(`UPDATE article_workflow SET ${statusCol} = ?, ${atCol} = ?, ${errorCol} = NULL, updated_at = ? WHERE id = ?`).run(status, now, now, workflowId);
    checkAndMarkComplete(workflowId);
  } else if (status === 'skipped') {
    // skipped 视同 done（不阻塞流程），但保留说明信息在 error 字段
    db.prepare(`UPDATE article_workflow SET ${statusCol} = 'done', ${atCol} = ?, ${errorCol} = ?, updated_at = ? WHERE id = ?`).run(now, error || '已跳过', now, workflowId);
    checkAndMarkComplete(workflowId);
  } else if (status === 'error') {
    db.prepare(`UPDATE article_workflow SET ${statusCol} = ?, ${errorCol} = ?, status = 'error', updated_at = ? WHERE id = ?`).run(status, error || '', now, workflowId);
  }
}

function checkAndMarkComplete(workflowId: number) {
  const wf = getWorkflow(workflowId);
  if (!wf) return;
  const allDone = STAGES.every(s => wf[`${s}_status`] === 'done');
  if (allDone) {
    db.prepare("UPDATE article_workflow SET status = 'done', updated_at = ? WHERE id = ?").run(new Date().toISOString(), workflowId);
  }
}

// ========== 主执行入口 ==========

export async function runWorkflow(workflowId: number): Promise<void> {
  if (!acquireLock(workflowId)) {
    console.log(`[Workflow ${workflowId}] Already running, skip`);
    return;
  }

  try {
    const wf = getWorkflow(workflowId);
    if (!wf) throw new Error(`Workflow ${workflowId} not found`);

    const account = db.prepare('SELECT * FROM managed_accounts WHERE id = ?').get(wf.account_id) as any;
    if (!account) throw new Error(`Account ${wf.account_id} not found`);

    const aiConfig = getAIConfig();
    if (!aiConfig.apiKey) throw new Error('AI API Key not configured');

    console.log(`[Workflow ${workflowId}] Starting for account: ${account.name}, status: ${wf.status}`);

    // 阶段1：选题
    if (wf.topic_status !== 'done') {
      await runTopicStage(wf, account, aiConfig);
    }
    let current = getWorkflow(workflowId);
    if (current.topic_status === 'error') return;

    // 阶段2：素材
    if (current.material_status !== 'done') {
      await runMaterialStage(current, account, aiConfig);
    }
    current = getWorkflow(workflowId);
    if (current.material_status === 'error') return;

    // 阶段3：正文
    if (current.draft_status !== 'done') {
      await runDraftStage(current, account, aiConfig);
    }
    current = getWorkflow(workflowId);
    if (current.draft_status === 'error') return;

    // 阶段4：配图
    if (current.image_status !== 'done') {
      await runImageStage(current, account);
    }
    current = getWorkflow(workflowId);
    if (current.image_status === 'error') return;

    // 阶段5：排版
    if (current.layout_status !== 'done') {
      await runLayoutStage(current, account);
    }
    current = getWorkflow(workflowId);
    if (current.layout_status === 'error') return;

    // 阶段6：推送
    if (current.push_status !== 'done') {
      if (account.appid && account.secret) {
        // 推送前完整性校验
        const article = db.prepare('SELECT formatted_html, content_with_images, content FROM generated_articles WHERE id = ?').get(current.article_id) as any;
        if (!article) {
          updateStage(workflowId, 'push', 'error', '文章不存在');
        } else {
          const html = article.formatted_html || article.content_with_images || article.content || '';
          if (html.length < 200) {
            updateStage(workflowId, 'push', 'error', `内容过短（${html.length}字符），可能生成异常，请检查后手动推送`);
          } else {
            await runPushStage(current, account);
          }
        }
      } else {
        // 未配置 AppID/Secret，跳过推送
        updateStage(workflowId, 'push', 'skipped', '未配置 AppID/Secret，请到「公众号运营」填写后再重试');
      }
    }

    console.log(`[Workflow ${workflowId}] Completed successfully`);
  } catch (error: any) {
    console.error(`[Workflow ${workflowId}] Unexpected error:`, error);
    db.prepare('UPDATE article_workflow SET status = ?, updated_at = ? WHERE id = ?').run('error', new Date().toISOString(), workflowId);
  } finally {
    releaseLock(workflowId);
  }
}

// ========== 阶段实现 ==========

async function runTopicStage(wf: any, account: any, aiConfig: any) {
  updateStage(wf.id, 'topic', 'running');
  try {
    let styleSummary = '';
    if (account.writing_style_id) {
      const style = db.prepare('SELECT overall_summary FROM account_writing_styles WHERE id = ?').get(account.writing_style_id) as any;
      if (style?.overall_summary) styleSummary = style.overall_summary;
    }

    const today = new Date().toISOString().split('T')[0];
    const category = wf.category || account.category || '综合';

    // 从 daily_topics 中选取该分类未被占用、未失败的选题
    // 排除：已被任何工作流使用（done/pending/running）的和已失败的
    let candidates = db
      .prepare(
        `SELECT * FROM daily_topics
         WHERE category = ? AND topic_date = ?
           AND (status IS NULL OR status = 'active')
           AND id NOT IN (SELECT topic_id FROM article_workflow WHERE topic_id IS NOT NULL AND topic_status IN ('done', 'pending', 'running'))`,
      )
      .all(category, today) as any[];

    // 如果没有当日话题，用 AI 生成 5 个
    if (candidates.length === 0) {
      console.log(`[Workflow ${wf.id}] No daily topics found, generating 5 via AI...`);

      // 获取该分类下的爆文数据作为参考
      const hotArticles = db.prepare(
        `SELECT a.title, am.read_num FROM articles a
         LEFT JOIN article_metadata am ON am.article_id = a.id
         WHERE a.fakeid IN (SELECT fakeid FROM mp_accounts WHERE category = ?)
         ORDER BY am.read_num DESC LIMIT 5`,
      ).all(category) as any[];
      const hotRef = hotArticles.map(a => `- ${a.title}（阅读${a.read_num || '?'}）`).join('\n');

      const genPrompt = `你是一位资深的微信公众号选题策划专家。
请为以下公众号生成 5 个写作选题。

公众号：${account.name}
分类：${category}
人设：${account.persona || '未设定'}
${styleSummary ? `写作风格参考：${styleSummary}` : ''}
今日日期：${new Date().toLocaleDateString('zh-CN')}

参考该分类下的高阅读文章：
${hotRef || '暂无参考数据'}

【选题安全红线（必须严格遵守）】
- 涉及中国政治、政府、领导人、政策法规的选题，仅限正面宣传、成就展示、政策解读等政治正确方向
- 禁止涉及：政治批评、负面评论、敏感事件、社会争议、群体对立、民族宗教矛盾
- 宁可选题保守，也绝不触碰政治敏感红线

请严格按以下 JSON 数组格式输出，不要包含任何其他内容：
[
  {"title": "选题标题", "angle": "核心角度", "viralPoint": "预计爆点"},
  {"title": "选题标题", "angle": "核心角度", "viralPoint": "预计爆点"},
  {"title": "选题标题", "angle": "核心角度", "viralPoint": "预计爆点"},
  {"title": "选题标题", "angle": "核心角度", "viralPoint": "预计爆点"},
  {"title": "选题标题", "angle": "核心角度", "viralPoint": "预计爆点"}
]`;

      const genResp = await fetch(`${aiConfig.apiBase}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiConfig.apiKey}` },
        body: JSON.stringify({ model: aiConfig.model, messages: [{ role: 'user', content: genPrompt }], temperature: 0.8, max_tokens: 2000 }),
      });

      if (!genResp.ok) {
        const errText = await genResp.text().catch(() => '');
        throw new Error(`Generate topics failed (${genResp.status}): ${errText.slice(0, 200)}`);
      }

      const genData = (await genResp.json()) as any;
      const genReply = genData.choices?.[0]?.message?.content || '';
      const jsonArrMatch = genReply.match(/\[[\s\S]*\]/);
      if (!jsonArrMatch) throw new Error('AI topics response is not valid JSON: ' + genReply.slice(0, 100));

      const topics = JSON.parse(jsonArrMatch[0]) as { title: string; angle: string; viralPoint: string }[];

      // 存入 daily_topics
      const insertStmt = db.prepare('INSERT INTO daily_topics (topic_date, category, title, angle, viral_point) VALUES (?, ?, ?, ?, ?)');
      for (const t of topics) {
        insertStmt.run(today, category, t.title, t.angle, t.viralPoint);
      }

      candidates = db
        .prepare(
          `SELECT * FROM daily_topics
           WHERE category = ? AND topic_date = ?
             AND (status IS NULL OR status = 'active')
             AND id NOT IN (SELECT topic_id FROM article_workflow WHERE topic_id IS NOT NULL AND topic_status IN ('done', 'pending', 'running'))`,
        )
        .all(category, today) as any[];

      console.log(`[Workflow ${wf.id}] Generated ${candidates.length} topics`);
    }

    if (candidates.length === 0) throw new Error('No topic available after generation');

    // 让 AI 为所有候选选题打分，选最高分的
    let bestTopic: any = null;

    if (candidates.length === 1) {
      bestTopic = candidates[0];
    } else {
      const topicList = candidates.map((t, i) => `${i + 1}. 「${t.title}」角度：${t.angle}，爆点：${t.viral_point}`).join('\n');

      const scorePrompt = `你是一位微信公众号运营专家，擅长判断选题的爆款潜力。

请对以下 ${candidates.length} 个选题进行评估，从以下维度打分（每项 1-10 分）：
- 话题热度：当前社会关注度
- 情绪共鸣：能否引发读者情感反应
- 传播潜力：读者转发分享的可能性
- 标题吸引力：标题的点击欲望
- 角度独特性：是否提供了新颖视角

公众号：${account.name}
分类：${category}
人设：${account.persona || '未设定'}

选题列表：
${topicList}

请严格按以下 JSON 数组格式输出，不要包含任何其他内容：
[{"index": 1, "score": 总分, "reason": "简短理由"}, ...]

按 score 从高到低排列。`;

      const scoreResp = await fetch(`${aiConfig.apiBase}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiConfig.apiKey}` },
        body: JSON.stringify({ model: aiConfig.model, messages: [{ role: 'user', content: scorePrompt }], temperature: 0.3, max_tokens: 800 }),
      });

      if (scoreResp.ok) {
        const scoreData = (await scoreResp.json()) as any;
        const scoreReply = scoreData.choices?.[0]?.message?.content || '';
        const scoreMatch = scoreReply.match(/\[[\s\S]*\]/);
        if (scoreMatch) {
          const scores = JSON.parse(scoreMatch[0]) as { index: number; score: number; reason: string }[];
          // 选最高分
          const best = scores.reduce((a, b) => (a.score > b.score ? a : b), scores[0]);
          const bestIdx = best.index - 1;
          if (bestIdx >= 0 && bestIdx < candidates.length) {
            bestTopic = candidates[bestIdx];
            console.log(`[Workflow ${wf.id}] Best topic: #${best.index} "${bestTopic.title}" (score: ${best.score}, ${best.reason})`);
          }
        }
      }

      // 打分失败则随机选一个
      if (!bestTopic) {
        bestTopic = candidates[Math.floor(Math.random() * candidates.length)];
        console.log(`[Workflow ${wf.id}] Score failed, random pick: "${bestTopic.title}"`);
      }
    }

    db.prepare('UPDATE article_workflow SET topic_id = ?, title = ? WHERE id = ?').run(bestTopic.id, bestTopic.title, wf.id);
    updateStage(wf.id, 'topic', 'done');
    console.log(`[Workflow ${wf.id}] Topic selected: ${bestTopic.title}`);
  } catch (error: any) {
    updateStage(wf.id, 'topic', 'error', error.message);
    console.error(`[Workflow ${wf.id}] Topic error:`, error.message);
  }
}

async function runMaterialStage(wf: any, account: any, aiConfig: any): Promise<void> {
  updateStage(wf.id, 'material', 'running');
  try {
    const topic = db.prepare('SELECT * FROM daily_topics WHERE id = ?').get(wf.topic_id) as any;
    if (!topic) throw new Error('Topic not found (topic_id=' + wf.topic_id + ')');

    const result = await callLocalAPI('/api/query/content/gather-materials', {
      topicId: topic.id,
      title: topic.title,
      category: wf.category,
      angle: topic.angle,
      viralPoint: topic.viral_point,
    });

    updateStage(wf.id, 'material', 'done');
    console.log(`[Workflow ${wf.id}] Materials gathered: ${result.data?.total || 0}`);
  } catch (error: any) {
    updateStage(wf.id, 'material', 'error', error.message);
    console.error(`[Workflow ${wf.id}] Material error:`, error.message);
  }
}

async function runDraftStage(wf: any, account: any, aiConfig: any): Promise<void> {
  updateStage(wf.id, 'draft', 'running');
  try {
    let styleFakeid: string | undefined;
    if (account.writing_style_id) {
      const style = db.prepare('SELECT fakeid FROM account_writing_styles WHERE id = ?').get(account.writing_style_id) as any;
      if (style) styleFakeid = style.fakeid;
    }

    const result = await callLocalAPI('/api/query/content/draft', {
      accountId: account.id,
      title: wf.title,
      topicId: wf.topic_id,
      styleFakeid,
    });

    db.prepare('UPDATE article_workflow SET article_id = ? WHERE id = ?').run(result.articleId, wf.id);

    // 质量校验：检测文章是否被截断
    const article = db.prepare('SELECT content FROM generated_articles WHERE id = ?').get(result.articleId) as any;
    if (article?.content) {
      const content = article.content as string;
      // 截断特征：末尾不是句号/感叹号/问号/引号/括号等正常结束符
      const lastChar = content.trim().slice(-1);
      const normalEnders = ['.', '。', '!', '！', '?', '？', '"', '"', "'", ')', '）', ']', '】', '`', '~'];
      if (content.length < 500) {
        throw new Error(`文章过短（${content.length}字），可能生成失败`);
      }
      if (!normalEnders.includes(lastChar) && content.length > 200) {
        console.warn(`[Workflow ${wf.id}] Draft may be truncated (ends with "${lastChar}", length: ${content.length})`);
      }
    }

    updateStage(wf.id, 'draft', 'done');
    console.log(`[Workflow ${wf.id}] Draft generated: article ${result.articleId}`);
  } catch (error: any) {
    updateStage(wf.id, 'draft', 'error', error.message);
    // 标记选题为失败，避免后续工作流重复选用
    if (wf.topic_id) {
      db.prepare("UPDATE daily_topics SET status = 'failed' WHERE id = ?").run(wf.topic_id);
      console.log(`[Workflow ${wf.id}] Topic ${wf.topic_id} marked as failed: ${error.message}`);
    }
    console.error(`[Workflow ${wf.id}] Draft error:`, error.message);
  }
}

async function runImageStage(wf: any, account: any): Promise<void> {
  updateStage(wf.id, 'image', 'running');
  try {
    if (!wf.article_id) throw new Error('No article_id (draft stage may have failed)');

    const result = await callLocalAPI('/api/query/content/auto-images', { articleId: wf.article_id, accountId: wf.account_id });
    const imgCount = result.data?.imageCount || 0;
    if (imgCount === 0) {
      console.warn(`[Workflow ${wf.id}] No images added, article may lack visual content`);
    }
    updateStage(wf.id, 'image', 'done');
    console.log(`[Workflow ${wf.id}] Images added: ${imgCount}`);
  } catch (error: any) {
    updateStage(wf.id, 'image', 'error', error.message);
    console.error(`[Workflow ${wf.id}] Image error:`, error.message);
  }
}

async function runLayoutStage(wf: any, account: any): Promise<void> {
  updateStage(wf.id, 'layout', 'running');
  try {
    if (!wf.article_id) throw new Error('No article_id (draft stage may have failed)');

    // 使用账号绑定的排版模板，没有则用默认
    let templateId: number | undefined = account.layout_template_id;
    if (!templateId) {
      const defaultTpl = db.prepare("SELECT id FROM layout_templates WHERE is_default = 1 LIMIT 1").get() as any;
      templateId = defaultTpl?.id;
    }

    const result = await callLocalAPI('/api/query/content/format-article', { articleId: wf.article_id, templateId, accountId: account.id });
    updateStage(wf.id, 'layout', 'done');
    console.log(`[Workflow ${wf.id}] Layout done with template ${templateId}`);
  } catch (error: any) {
    updateStage(wf.id, 'layout', 'error', error.message);
    console.error(`[Workflow ${wf.id}] Layout error:`, error.message);
  }
}

async function runPushStage(wf: any, account: any): Promise<void> {
  updateStage(wf.id, 'push', 'running');
  try {
    if (!wf.article_id) throw new Error('No article_id (draft stage may have failed)');

    // 检查文章是否已经推送过
    const article = db.prepare('SELECT publish_status FROM generated_articles WHERE id = ?').get(wf.article_id) as any;
    if (article?.publish_status === 'pushed' || article?.publish_status === 'published') {
      updateStage(wf.id, 'push', 'done');
      return;
    }

    const result = await callLocalAPI('/api/query/content/push-draft', { articleId: wf.article_id, accountId: account.id });
    updateStage(wf.id, 'push', 'done');
    console.log(`[Workflow ${wf.id}] Pushed to draft: media_id ${result.data?.mediaId}`);
  } catch (error: any) {
    updateStage(wf.id, 'push', 'error', error.message);
    console.error(`[Workflow ${wf.id}] Push error:`, error.message);
  }
}

// ========== 批量触发 ==========

/**
 * 为所有启用自动发布的账号创建今日工作流
 * 按 daily_publish_count 配置创建对应数量的工作流
 */
export async function triggerDailyWorkflows(): Promise<{ created: number; errors: string[] }> {
  const accounts = db.prepare('SELECT * FROM managed_accounts WHERE enabled = 1').all() as any[];
  const today = new Date().toISOString().split('T')[0];
  const errors: string[] = [];
  let created = 0;

  for (const account of accounts) {
    try {
      const publishCount = account.daily_publish_count || 1;

      // 检查今日已创建的工作流数量
      const todayCount = db
        .prepare('SELECT COUNT(*) as cnt FROM article_workflow WHERE account_id = ? AND workflow_date = ?')
        .get(account.id, today) as any;
      const remaining = publishCount - (todayCount?.cnt || 0);
      if (remaining <= 0) continue;

      // 检查是否已有 pending/running 的工作流（有则等跑完再创建更多）
      const active = db
        .prepare("SELECT id FROM article_workflow WHERE account_id = ? AND status IN ('pending', 'running')")
        .get(account.id) as any;
      if (active) continue;

      // 按 daily_publish_count 创建对应数量的工作流
      for (let i = 0; i < remaining; i++) {
        const wfId = createWorkflow(account.id, account.category || '', today);
        created++;
        // 第一条立即执行，后续按顺序异步串行
        if (i === 0) {
          runWorkflow(wfId).catch(err => {
            console.error(`[Workflow] Account ${account.name} failed:`, err.message);
          });
        } else {
          // 后续工作流延迟执行，等前一条完成后再启动
          const delayMs = i * 3 * 60 * 1000; // 每条间隔 3 分钟
          setTimeout(() => {
            runWorkflow(wfId).catch(err => {
              console.error(`[Workflow] Account ${account.name} delayed task failed:`, err.message);
            });
          }, delayMs);
        }
      }
    } catch (err: any) {
      errors.push(`${account.name}: ${err.message}`);
    }
  }

  return { created, errors };
}

/**
 * 续跑所有失败的工作流
 */
export async function retryFailedWorkflows(): Promise<number> {
  const failed = db.prepare("SELECT id FROM article_workflow WHERE status = 'error'").all() as any[];
  for (const wf of failed) {
    if (runningLocks.has(wf.id)) continue; // 跳过正在运行的

    const detail = getWorkflow(wf.id);
    for (const stage of STAGES) {
      if (detail[`${stage}_status`] === 'error') {
        db.prepare(`UPDATE article_workflow SET ${stage}_status = 'pending', ${stage}_error = NULL WHERE id = ?`).run(wf.id);
      }
    }
    db.prepare("UPDATE article_workflow SET status = 'pending' WHERE id = ?").run(wf.id);
    runWorkflow(wf.id).catch(err => {
      console.error(`[Workflow retry ${wf.id}] failed:`, err.message);
    });
  }
  return failed.length;
}

/**
 * 推送已完成排版但未推送的文章（定时发布用）
 * 命中配置时间后，随机延迟 1~15 分钟再推送，避免被微信识别为自动操作
 */
export async function pushReadyArticles(): Promise<number> {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const ready = db
    .prepare(
      `SELECT w.*, m.appid, m.secret, m.publish_time
       FROM article_workflow w
       JOIN managed_accounts m ON m.id = w.account_id
       WHERE w.layout_status = 'done'
         AND w.push_status = 'pending'
         AND w.article_id IS NOT NULL
         AND m.auto_publish = 1
         AND m.appid IS NOT NULL
         AND m.publish_time = ?`,
    )
    .all(currentTime) as any[];

  for (const wf of ready) {
    if (runningLocks.has(wf.id)) continue; // 跳过正在运行的

    const article = db.prepare('SELECT publish_status FROM generated_articles WHERE id = ?').get(wf.article_id) as any;
    if (article?.publish_status === 'pushed' || article?.publish_status === 'published') {
      updateStage(wf.id, 'push', 'done');
      continue;
    }

    // 先标记为 running，防止下一分钟重复触发
    updateStage(wf.id, 'push', 'running');

    // 随机延迟 1~15 分钟
    const delayMin = 1 + Math.floor(Math.random() * 15);
    const delayMs = delayMin * 60 * 1000;
    console.log(`[Push ready ${wf.id}] Scheduled to push in ${delayMin} minutes`);

    setTimeout(async () => {
      try {
        const fresh = getWorkflow(wf.id);
        await runPushStage(fresh, { id: wf.account_id, appid: wf.appid, secret: wf.secret });
      } catch (err: any) {
        console.error(`[Push ready ${wf.id}] failed after delay:`, err.message);
      }
    }, delayMs);
  }

  return ready.length;
}

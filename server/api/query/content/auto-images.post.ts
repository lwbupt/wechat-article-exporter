/**
 * 一键自动配图 API
 * 流程：读文章+分类配置 → AI提取搜索词 → 搜索多张候选 → AI多模态选图 → 上传微信素材库 → 插入Markdown
 */

import { getAIConfig } from '~/server/utils/ai-config';
import { getImageProvider, type ImageResult } from '~/server/utils/image-providers';
import db from '~/server/database/index';

interface ImageToInsert {
  url: string;
  alt: string;
  headingIndex: number;
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { articleId, accountId } = body as { articleId: number; accountId?: number };

    if (!articleId) {
      return { success: false, error: '缺少文章 ID' };
    }

    // 1. 读文章
    const article = db
      .prepare('SELECT id, content, content_with_images, category FROM generated_articles WHERE id = ?')
      .get(articleId) as any;
    if (!article) {
      return { success: false, error: '文章不存在' };
    }

    const mdContent = article.content_with_images || article.content || '';
    if (!mdContent) {
      return { success: false, error: '文章内容为空' };
    }

    // 2. 读配图配置：账号级覆盖 > 分类默认
    const category = article.category || '';
    let imageMode = 'search';
    let imageCount = 2;
    let imageSource = 'free_search';

    if (category) {
      const catRow = db.prepare('SELECT image_mode, image_count, image_source FROM categories WHERE name = ?').get(category) as any;
      if (catRow) {
        imageMode = catRow.image_mode || 'search';
        imageCount = catRow.image_count || 2;
        imageSource = catRow.image_source || 'free_search';
      }
    }

    if (accountId) {
      const accRow = db.prepare('SELECT image_mode, image_count, image_source FROM managed_accounts WHERE id = ?').get(accountId) as any;
      if (accRow) {
        if (accRow.image_mode) imageMode = accRow.image_mode;
        if (accRow.image_count > 0) imageCount = accRow.image_count;
        if (accRow.image_source) imageSource = accRow.image_source;
      }
    }

    if (imageMode === 'none') {
      return { success: true, data: { message: '该分类已设为不配图', imageCount: 0 } };
    }

    // 3. AI 提取搜索词
    const aiConfig = getAIConfig();
    let searchKeywords: string[] = [];

    if (aiConfig.apiKey) {
      try {
        searchKeywords = await extractImageKeywords(aiConfig, mdContent, imageCount);
        console.log(`[AutoImage] AI extracted keywords:`, searchKeywords);
      } catch (err) {
        console.error('[AutoImage] AI keyword extraction failed:', err);
      }
    }

    if (searchKeywords.length === 0) {
      const titleMatch = mdContent.match(/^#\s+(.+)$/m) || mdContent.match(/^##\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : mdContent.substring(0, 30);
      searchKeywords = [title];
    }

    // 4. 搜索候选图片（每个关键词搜索 10 张）
    const provider = getImageProvider(imageSource);
    console.log(`[AutoImage] Using provider: ${provider.label}, category: ${category}`);
    const candidateGroups: { keyword: string; images: ImageResult[] }[] = [];

    // 付费搜索搜 10 张候选，免费搜索只取需要的数量（Pexels 已是无水印高质量图）
    const isPaidSearch = imageSource === 'paid_search' || imageSource === 'serper';
    const searchCount = isPaidSearch ? 10 : imageCount;

    for (const kw of searchKeywords.slice(0, imageCount)) {
      try {
        const images = await provider.search(kw, searchCount);
        if (images.length > 0) {
          candidateGroups.push({ keyword: kw, images });
        }
      } catch (err) {
        console.error(`[AutoImage] ${provider.label} search failed for "${kw}":`, err);
      }
    }

    if (candidateGroups.length === 0) {
      return { success: false, error: '未搜索到合适的图片，请检查图片搜索 API 配置' };
    }

    // 5. AI 多模态选图（仅付费搜索需要，免费搜索图片质量有保证直接取第1张）
    const selectedImages: ImageResult[] = [];
    for (const group of candidateGroups) {
      if (!isPaidSearch || group.images.length <= 1) {
        selectedImages.push(group.images[0]);
        continue;
      }
      const best = await selectBestImage(aiConfig, group.images, group.keyword);
      selectedImages.push(best);
      console.log(`[AutoImage] AI selected best for "${group.keyword}": ${best.id} (from ${group.images.length} candidates)`);
    }

    // 6. 上传图片到微信素材库（如有账号配置）
    let wechatToken = '';
    if (accountId) {
      wechatToken = await getWechatToken(accountId);
    }

    const finalImages: ImageResult[] = [];
    for (const img of selectedImages) {
      if (wechatToken) {
        try {
          const wxUrl = await uploadToWechat(img.url, wechatToken);
          finalImages.push({ ...img, url: wxUrl });
          console.log(`[AutoImage] Uploaded to WeChat: ${wxUrl.substring(0, 60)}...`);
        } catch (err: any) {
          console.error(`[AutoImage] WeChat upload failed, using original URL:`, err.message);
          finalImages.push(img);
        }
      } else {
        finalImages.push(img);
      }
    }

    // 7. 计算插入位置
    const insertions = calculateInsertPositions(mdContent, finalImages, imageCount);

    // 8. 插入 Markdown 并保存
    const updatedContent = insertImages(mdContent, insertions);

    db.prepare('DELETE FROM article_images WHERE article_id = ?').run(articleId);
    const insertStmt = db.prepare(
      `INSERT INTO article_images (article_id, original_url, hosted_url, thumbnail_url, alt_text, source, position, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, 'inline', ?)`,
    );
    for (let i = 0; i < finalImages.length; i++) {
      const img = finalImages[i];
      insertStmt.run(articleId, selectedImages[i].url, img.url, img.thumbnail, img.alt, img.source, i);
    }

    db.prepare('UPDATE generated_articles SET content_with_images = ? WHERE id = ?').run(updatedContent, articleId);

    return {
      success: true,
      data: {
        contentWithImages: updatedContent,
        imageCount: finalImages.length,
        keywords: searchKeywords.slice(0, imageCount),
      },
    };
  } catch (error) {
    console.error('Auto-image failed:', error);
    return { success: false, error: error instanceof Error ? error.message : '配图失败' };
  }
});

// ========== AI 多模态选图 ==========

async function selectBestImage(
  aiConfig: { apiKey: string; apiBase: string; model: string },
  candidates: ImageResult[],
  keyword: string,
): Promise<ImageResult> {
  // 没有 AI key 或候选太少，直接取第一张
  if (!aiConfig.apiKey || candidates.length <= 1) {
    return candidates[0];
  }

  try {
    // 下载候选图片的缩略图，转为 base64
    const maxCandidates = Math.min(candidates.length, 8);
    const imagePayloads: { type: 'image_url'; image_url: { url: string } }[] = [];

    for (let i = 0; i < maxCandidates; i++) {
      const img = candidates[i];
      const imgUrl = img.thumbnail || img.url;
      try {
        const resp = await fetch(imgUrl, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) continue;
        const buf = await resp.arrayBuffer();
        if (buf.byteLength < 1024) continue;
        const contentType = resp.headers.get('content-type') || 'image/jpeg';
        const base64 = Buffer.from(buf).toString('base64');
        imagePayloads.push({
          type: 'image_url',
          image_url: { url: `data:${contentType};base64,${base64}` },
        });
      } catch {
        continue;
      }
    }

    if (imagePayloads.length <= 1) return candidates[0];

    // 构建评分 prompt
    const prompt = `你是图片质量评审专家。以下是 ${imagePayloads.length} 张候选配图（按顺序编号1-${imagePayloads.length}），搜索关键词是"${keyword}"。

请对每张图片按以下标准打分（1-10分）：
1. **相关性**（权重最高）：图片内容与搜索关键词"${keyword}"的匹配程度
2. **无水印**：图片是否有明显水印、logo、文字叠加（有水印扣分）
3. **画质**：图片清晰度、构图、美观度

直接输出每张图片的总分，每行一个分数，严格按顺序，不要编号不要额外文字：`;

    const content: any[] = [{ type: 'text', text: prompt }];
    for (const img of imagePayloads) {
      content.push(img);
    }

    const response = await fetch(`${aiConfig.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [{ role: 'user', content }],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.warn(`[AutoImage] Vision API failed (${response.status}), using first image`);
      return candidates[0];
    }

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content || '';

    const scores = text.split('\n').map(l => l.trim()).filter(l => /^\d+(\.\d+)?$/.test(l)).map(Number);
    if (scores.length === 0) return candidates[0];

    // 找最高分的候选
    let bestIdx = 0;
    let bestScore = 0;
    for (let i = 0; i < scores.length && i < imagePayloads.length; i++) {
      if (scores[i] > bestScore) {
        bestScore = scores[i];
        bestIdx = i;
      }
    }

    return candidates[bestIdx] || candidates[0];
  } catch (err) {
    console.error('[AutoImage] Vision selection failed:', err);
    return candidates[0];
  }
}

// ========== 微信素材库上传 ==========

async function getWechatToken(accountId: number): Promise<string> {
  // 先查缓存
  const cached = db.prepare('SELECT access_token, expires_at FROM wechat_tokens WHERE account_id = ?').get(accountId) as any;
  if (cached?.access_token && cached.expires_at > Date.now()) {
    return cached.access_token;
  }

  // 获取新 token
  const account = db.prepare('SELECT appid, secret FROM managed_accounts WHERE id = ?').get(accountId) as any;
  if (!account?.appid || !account?.secret) return '';

  const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${account.appid}&secret=${account.secret}`;
  const resp = await fetch(tokenUrl);
  const data = await resp.json() as { access_token?: string; errcode?: number };
  if (!data.access_token) return '';

  // 缓存
  db.prepare(`
    INSERT INTO wechat_tokens (account_id, access_token, expires_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(account_id) DO UPDATE SET access_token = excluded.access_token, expires_at = excluded.expires_at, updated_at = CURRENT_TIMESTAMP
  `).run(accountId, data.access_token, Date.now() + 7000 * 1000);

  return data.access_token;
}

async function uploadToWechat(imageUrl: string, token: string): Promise<string> {
  // 下载图片
  const resp = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`下载失败(${resp.status})`);
  const contentType = resp.headers.get('content-type') || 'image/jpeg';
  const buf = await resp.arrayBuffer();
  if (buf.byteLength < 1024) throw new Error('文件过小');

  // 上传到微信（uploadimg 接口用于文章内图片，不占素材库配额）
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const uploadUrl = `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${token}`;
  const formData = new FormData();
  formData.append('media', new Blob([buf]), `image.${ext}`);

  const uploadResp = await fetch(uploadUrl, { method: 'POST', body: formData });
  const uploadData = await uploadResp.json() as { url?: string; errcode?: number; errmsg?: string };

  if (!uploadData.url) {
    throw new Error(`微信上传失败(${uploadData.errcode}): ${uploadData.errmsg}`);
  }

  return uploadData.url;
}

// ========== AI 提取图片搜索词 ==========

async function extractImageKeywords(
  aiConfig: { apiKey: string; apiBase: string; model: string },
  content: string,
  count: number,
): Promise<string[]> {
  const titleMatch = content.match(/^#\s+(.+)$/m) || content.match(/^##\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : '';
  const summary = content.replace(/^#{1,4}\s+.+$/gm, '').replace(/!\[.*?\]\(.*?\)/g, '').trim().substring(0, 500);

  const prompt = `根据以下文章标题和内容，提取 ${count} 个用于搜索配图的关键词短语。
要求：
- 每个关键词描述文章中需要配图的场景/物体/概念
- 关键词要具体、有画面感，适合在图片搜索引擎中搜索
- 不要用抽象概念，用具体事物（如用"工厂流水线"而非"制造业"）

文章标题：${title}
文章摘要：${summary}

输出格式（每行一个关键词短语，不要编号，不要额外解释）：`;

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
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API failed (${response.status})`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content || '';

  return text
    .split('\n')
    .map(l => l.replace(/^\d+[\.\、\)\]]\s*/, '').trim())
    .filter(l => l.length >= 2 && l.length <= 30)
    .slice(0, count);
}

// ========== 计算插入位置 ==========

function calculateInsertPositions(md: string, images: ImageResult[], count: number): ImageToInsert[] {
  const insertions: ImageToInsert[] = [];
  const lines = md.split('\n');

  const h2Indices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      h2Indices.push(i);
    }
  }

  if (images.length >= 1) {
    insertions.push({ url: images[0].url, alt: images[0].alt, headingIndex: 0 });
  }

  if (images.length >= 2 && h2Indices.length >= 2) {
    const midIndex = Math.floor(h2Indices.length / 2);
    for (let i = 1; i < images.length && i < count; i++) {
      const targetH2 = Math.min(midIndex + (i - 1), h2Indices.length - 1);
      insertions.push({ url: images[i].url, alt: images[i].alt, headingIndex: targetH2 + 1 });
    }
  } else if (images.length >= 2) {
    insertions.push({ url: images[1].url, alt: images[1].alt, headingIndex: -1 });
  }

  return insertions;
}

// ========== 插入图片到 Markdown ==========

function insertImages(md: string, insertions: ImageToInsert[]): string {
  const lines = md.split('\n');

  const h2LineNumbers: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      h2LineNumbers.push(i);
    }
  }

  const sortedInsertions = [...insertions].sort((a, b) => b.headingIndex - a.headingIndex);

  for (const ins of sortedInsertions) {
    const imageLine = `\n![](${ins.url})`;

    if (ins.headingIndex === 0) {
      const firstH2 = h2LineNumbers.length > 0 ? h2LineNumbers[0] : lines.length;
      let insertPos = firstH2;
      while (insertPos > 0 && lines[insertPos - 1].trim() === '') insertPos--;
      lines.splice(insertPos, 0, imageLine);
    } else if (ins.headingIndex === -1) {
      lines.push(imageLine);
    } else {
      const targetIdx = ins.headingIndex - 1;
      if (targetIdx >= 0 && targetIdx < h2LineNumbers.length) {
        const lineNum = h2LineNumbers[targetIdx];
        lines.splice(lineNum, 0, imageLine);
      } else {
        lines.push(imageLine);
      }
    }
  }

  return lines.join('\n');
}

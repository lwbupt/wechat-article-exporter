/**
 * 推送文章到微信公众号草稿箱
 * 1. 获取 access_token
 * 2. 上传封面图（如有）
 * 3. 调用草稿箱 API
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { articleId, accountId } = body as { articleId: number; accountId: number };

    if (!articleId || !accountId) {
      return { success: false, error: '缺少参数' };
    }

    // 读取账号信息
    const account = db
      .prepare('SELECT id, name, appid, secret FROM managed_accounts WHERE id = ?')
      .get(accountId) as { id: number; name: string; appid: string; secret: string } | undefined;
    if (!account || !account.appid || !account.secret) {
      return { success: false, error: '公众号未配置 AppID/Secret' };
    }

    // 读取文章
    const article = db
      .prepare('SELECT id, title, content, content_with_images, formatted_html, category FROM generated_articles WHERE id = ?')
      .get(articleId) as any;
    if (!article) {
      return { success: false, error: '文章不存在' };
    }

    // 获取 access_token
    const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${account.appid}&secret=${account.secret}`;
    const tokenResp = await fetch(tokenUrl);
    const tokenData = await tokenResp.json() as { access_token?: string; errcode?: number; errmsg?: string };
    if (!tokenData.access_token) {
      return { success: false, error: `获取 token 失败: ${tokenData.errmsg || '未知错误'}` };
    }
    const token = tokenData.access_token;

    // 缓存 token
    const tokenExpiresAt = Date.now() + 7000 * 1000;
    db.prepare(`
      INSERT INTO wechat_tokens (account_id, access_token, expires_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(account_id) DO UPDATE SET
        access_token = excluded.access_token, expires_at = excluded.expires_at, updated_at = CURRENT_TIMESTAMP
    `).run(accountId, token, tokenExpiresAt);

    // 上传封面图：优先用 position=cover，否则顺次尝试所有配图
    let thumbMediaId = '';
    const allImages = db
      .prepare("SELECT hosted_url, original_url FROM article_images WHERE article_id = ? ORDER BY CASE WHEN position = 'cover' THEN 0 ELSE 1 END, sort_order ASC")
      .all(articleId) as { hosted_url: string; original_url: string }[];

    const uploadErrors: string[] = [];
    for (const img of allImages) {
      const imageUrl = img.hosted_url || img.original_url;
      try {
        const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
        if (!imgResp.ok) {
          uploadErrors.push(`下载失败(${imgResp.status}): ${imageUrl.substring(0, 80)}`);
          continue;
        }
        const contentType = imgResp.headers.get('content-type') || '';
        const imgBuffer = await imgResp.arrayBuffer();
        if (imgBuffer.byteLength < 1024) {
          uploadErrors.push(`文件过小(${imgBuffer.byteLength}B): ${imageUrl.substring(0, 80)}`);
          continue;
        }

        const ext = contentType.includes('png') ? 'png' : 'jpg';
        const uploadUrl = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${token}&type=image`;
        const formData = new FormData();
        formData.append('media', new Blob([imgBuffer]), `cover.${ext}`);

        const uploadResp = await fetch(uploadUrl, { method: 'POST', body: formData });
        const uploadData = await uploadResp.json() as { media_id?: string; errcode?: number; errmsg?: string };
        if (uploadData.media_id) {
          thumbMediaId = uploadData.media_id;
          break;
        } else {
          uploadErrors.push(`微信拒绝(${uploadData.errcode}): ${uploadData.errmsg}`);
        }
      } catch (err: any) {
        uploadErrors.push(`${err?.message || '下载异常'}: ${imageUrl.substring(0, 80)}`);
      }
    }

    if (!thumbMediaId) {
      const detail = uploadErrors.length > 0 ? `（${uploadErrors.join('；')}）` : '';
      return { success: false, error: `封面图上传失败，共 ${allImages.length} 张图片均不可用${detail}` };
    }

    // 准备文章内容
    const htmlContent = article.formatted_html || article.content_with_images || article.content || '';
    const digest = article.content
      ? article.content.substring(0, 120).replace(/[#*\n]/g, ' ').trim()
      : '';

    // 调用草稿箱 API
    const draftBody: Record<string, any> = {
      articles: [
        {
          title: article.title,
          content: htmlContent,
          author: account.name,
          digest,
          content_source_url: '',
          need_open_comment: 1,
          only_fans_can_comment: 0,
        },
      ],
    };

    if (thumbMediaId) {
      draftBody.articles[0].thumb_media_id = thumbMediaId;
    }

    const draftUrl = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;
    const draftResp = await fetch(draftUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draftBody),
    });
    const draftData = await draftResp.json() as { media_id?: string; errcode?: number; errmsg?: string };

    if (!draftData.media_id) {
      const errMsg = `推送失败 (${draftData.errcode}): ${draftData.errmsg}`;
      return { success: false, error: errMsg };
    }

    // 更新文章状态
    db.prepare("UPDATE generated_articles SET publish_status = 'pushed' WHERE id = ?").run(articleId);

    return {
      success: true,
      data: { mediaId: draftData.media_id },
    };
  } catch (error) {
    console.error('Push draft failed:', error);
    return { success: false, error: '推送失败，请稍后重试' };
  }
});

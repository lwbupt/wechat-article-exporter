/**
 * 保存文章配图
 * 1. 上传图片到图床
 * 2. 保存到 article_images 表
 * 3. 更新文章 Markdown（插入图片占位符）
 */

import db from '~/server/database/index';
import { uploadToImageHost } from '~/server/utils/image-host';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { articleId, images } = body as {
      articleId: number;
      images: { originalUrl: string; altText: string; position: string }[];
    };

    if (!articleId || !images?.length) {
      return { success: false, error: '缺少参数' };
    }

    // 检查文章是否存在
    const article = db
      .prepare('SELECT id, content, content_with_images FROM generated_articles WHERE id = ?')
      .get(articleId) as any;
    if (!article) {
      return { success: false, error: '文章不存在' };
    }

    // 清除该文章之前的配图记录
    db.prepare('DELETE FROM article_images WHERE article_id = ?').run(articleId);

    // 上传图床 + 保存记录
    const insertStmt = db.prepare(`
      INSERT INTO article_images (article_id, original_url, hosted_url, thumbnail_url, alt_text, source, position, sort_order)
      VALUES (?, ?, ?, ?, ?, 'unsplash', ?, ?)
    `);

    const savedImages: { hostedUrl: string; altText: string; position: string }[] = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      // 上传图床
      const hostedUrl = await uploadToImageHost(img.originalUrl);
      // 用 hostedUrl 的缩略版作为 thumbnail（Unsplash small 尺寸）
      const thumbnailUrl = img.originalUrl.replace(/w=\d+/, 'w=400');
      insertStmt.run(articleId, img.originalUrl, hostedUrl, thumbnailUrl, img.altText, img.position, i);
      savedImages.push({ hostedUrl, altText: img.altText, position: img.position });
    }

    // 更新文章 Markdown：在原文基础上追加图片占位符
    const baseContent = article.content_with_images || article.content || '';
    const imageLines = savedImages
      .filter(img => img.position === 'inline')
      .map(img => `\n\n![${img.altText}](${img.hostedUrl})`)
      .join('');
    const contentWithImages = baseContent + imageLines;

    db.prepare('UPDATE generated_articles SET content_with_images = ? WHERE id = ?').run(
      contentWithImages,
      articleId,
    );

    return { success: true, data: { contentWithImages } };
  } catch (error) {
    console.error('Failed to save images:', error);
    return { success: false, error: '保存配图失败' };
  }
});

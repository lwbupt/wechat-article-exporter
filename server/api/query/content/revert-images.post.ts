/**
 * 回退配图：清除 content_with_images 和 article_images，恢复原文
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { articleId } = body as { articleId: number };

    if (!articleId) {
      return { success: false, error: '缺少文章 ID' };
    }

    const article = db.prepare('SELECT id, content FROM generated_articles WHERE id = ?').get(articleId) as any;
    if (!article) {
      return { success: false, error: '文章不存在' };
    }

    // 清除配图内容，恢复为原文
    db.prepare('UPDATE generated_articles SET content_with_images = NULL WHERE id = ?').run(articleId);
    db.prepare('DELETE FROM article_images WHERE article_id = ?').run(articleId);

    return { success: true, data: { content: article.content } };
  } catch (error) {
    console.error('Revert images failed:', error);
    return { success: false, error: error instanceof Error ? error.message : '回退失败' };
  }
});

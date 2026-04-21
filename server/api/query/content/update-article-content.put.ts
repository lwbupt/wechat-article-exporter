/**
 * 更新文章配图内容（手动编辑后保存）
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { articleId, contentWithImages } = body as { articleId: number; contentWithImages: string };

    if (!articleId || !contentWithImages) {
      return { success: false, error: '缺少参数' };
    }

    db.prepare('UPDATE generated_articles SET content_with_images = ? WHERE id = ?').run(contentWithImages, articleId);

    return { success: true };
  } catch (error) {
    console.error('Update article content failed:', error);
    return { success: false, error: error instanceof Error ? error.message : '保存失败' };
  }
});

/**
 * 查询文章已选图片
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const articleId = Number(query.articleId);

  if (!articleId) {
    return { success: false, error: '缺少 articleId 参数' };
  }

  try {
    const images = db
      .prepare('SELECT * FROM article_images WHERE article_id = ? ORDER BY sort_order, id')
      .all(articleId);
    return { success: true, data: images };
  } catch (error) {
    console.error('Failed to load article images:', error);
    return { success: false, error: '加载图片失败' };
  }
});

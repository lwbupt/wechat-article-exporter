/**
 * 查询单篇生成的文章内容
 */

import db from '~/server/database/index';

export default defineEventHandler(event => {
  const id = Number(getRouterParam(event, 'id'));
  if (!id) {
    return { success: false, error: '无效的文章 ID' };
  }

  try {
    const article = db.prepare('SELECT * FROM generated_articles WHERE id = ?').get(id) as any;
    if (!article) {
      return { success: false, error: '文章不存在' };
    }
    return { success: true, data: article };
  } catch (error) {
    console.error('Get generated article failed:', error);
    return { success: false, error: '查询失败' };
  }
});

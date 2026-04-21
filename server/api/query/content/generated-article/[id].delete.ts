/**
 * 删除生成的文章
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  const id = Number(getRouterParam(event, 'id'));
  if (!id) {
    return { success: false, error: '无效的文章 ID' };
  }

  try {
    const result = db.prepare('DELETE FROM generated_articles WHERE id = ?').run(id);
    if (result.changes === 0) {
      return { success: false, error: '文章不存在' };
    }
    return { success: true };
  } catch (error) {
    console.error('Delete generated article failed:', error);
    return { success: false, error: '删除失败' };
  }
});

/**
 * 更新爆文解析记录的分类
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { id, category } = body;

    if (!id || !category) {
      return { success: false, error: 'id 和 category 不能为空' };
    }

    db.prepare('UPDATE article_analysis SET category = ? WHERE id = ?').run(category, id);
    return { success: true };
  } catch (error) {
    console.error('Failed to update analysis category:', error);
    return { success: false, error: '更新失败' };
  }
});

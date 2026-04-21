/**
 * 获取爆文解析历史记录
 */

import db from '~/server/database/index';

export default defineEventHandler(event => {
  try {
    const query = getQuery(event);
    const id = query.id as string;

    if (id) {
      // 查询单条详情
      const record = db.prepare('SELECT * FROM article_analysis WHERE id = ?').get(id);
      if (!record) {
        return { success: false, error: '记录不存在' };
      }
      return { success: true, data: record };
    }

    // 查询列表（不含长文本字段）
    const records = db
      .prepare('SELECT id, url, title, category, summary, created_at FROM article_analysis ORDER BY created_at DESC')
      .all();
    return { success: true, data: records };
  } catch (error) {
    console.error('Failed to get analysis records:', error);
    return { success: false, error: '查询失败' };
  }
});

/**
 * 分页查询爆文解析记录
 */

import db from '~/server/database/index';

export default defineEventHandler(event => {
  try {
    const query = getQuery(event);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10));
    const offset = (page - 1) * pageSize;

    const total = (db.prepare('SELECT COUNT(*) as count FROM article_analysis').get() as { count: number }).count;

    const records = db
      .prepare(
        `SELECT id, url, title, category, summary, created_at
         FROM article_analysis
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(pageSize, offset);

    return {
      success: true,
      data: {
        records,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  } catch (error) {
    console.error('Failed to query analysis list:', error);
    return { success: false, error: '查询失败' };
  }
});

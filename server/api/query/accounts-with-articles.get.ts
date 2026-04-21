/**
 * 查询有文章的公众号列表（用于风格解析）
 */

import db from '~/server/database/index';

export default defineEventHandler(() => {
  try {
    const accounts = db.prepare(`
      SELECT m.fakeid, m.nickname, m.category,
             (SELECT COUNT(*) FROM articles WHERE fakeid = m.fakeid AND is_deleted = 0) as articles
      FROM mp_accounts m
      WHERE (SELECT COUNT(*) FROM articles WHERE fakeid = m.fakeid AND is_deleted = 0) > 0
      ORDER BY articles DESC
    `).all();
    return { success: true, data: accounts };
  } catch (error) {
    console.error('Failed to load accounts:', error);
    return { success: false, error: '加载失败' };
  }
});

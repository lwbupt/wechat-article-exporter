/**
 * 查询公众号风格解析结果
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const fakeid = query.fakeid as string;
  const category = query.category as string;

  try {
    if (fakeid) {
      const style = db
        .prepare('SELECT * FROM account_writing_styles WHERE fakeid = ? ORDER BY updated_at DESC LIMIT 1')
        .get(fakeid);
      return { success: true, data: style || null };
    }

    if (category) {
      const list = db
        .prepare(`SELECT s.id, s.fakeid, s.account_name, s.article_count, s.overall_summary, s.updated_at
                  FROM account_writing_styles s
                  JOIN mp_accounts m ON m.fakeid = s.fakeid
                  WHERE m.category = ?
                  ORDER BY s.updated_at DESC`)
        .all(category);
      return { success: true, data: list };
    }

    // 返回所有风格分析列表
    const list = db
      .prepare('SELECT id, fakeid, account_name, article_count, overall_summary, created_at, updated_at FROM account_writing_styles ORDER BY updated_at DESC')
      .all();
    return { success: true, data: list };
  } catch (error) {
    console.error('Failed to load style analysis:', error);
    return { success: false, error: '加载失败' };
  }
});

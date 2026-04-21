/**
 * 轻量查询公众号下的文章列表（仅 ID/标题/日期/摘要/是否下载内容）
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const fakeid = query.fakeid as string;
    if (!fakeid) {
      return { success: false, data: [], pagination: { total: 0, page: 1, totalPages: 0 } };
    }

    const page = Math.max(1, parseInt((query.page as string) || '1'));
    const limit = Math.min(50, Math.max(1, parseInt((query.limit as string) || '20')));
    const offset = (page - 1) * limit;

    const total = (db
      .prepare('SELECT COUNT(*) as c FROM articles a LEFT JOIN article_html h ON h.article_id = a.id WHERE a.fakeid = ? AND a.is_deleted = 0 AND (h.article_id IS NOT NULL OR a.content_download = 1)')
      .get(fakeid) as { c: number }).c;

    const rows = db
      .prepare(
        `SELECT a.id, a.title, a.datetime, a.digest,
                CASE WHEN h.article_id IS NOT NULL THEN 1 ELSE 0 END AS has_html,
                a.content_download
         FROM articles a
         LEFT JOIN article_html h ON h.article_id = a.id
         WHERE a.fakeid = ? AND a.is_deleted = 0 AND (h.article_id IS NOT NULL OR a.content_download = 1)
         ORDER BY a.datetime DESC
         LIMIT ? OFFSET ?`,
      )
      .all(fakeid, limit, offset) as any[];

    const data = rows.map(r => ({
      id: r.id,
      title: r.title || '',
      datetime: r.datetime ? new Date(r.datetime * 1000).toISOString().substring(0, 10) : '',
      digest: (r.digest || '').substring(0, 80),
      hasContent: !!(r.has_html || r.content_download),
    }));

    return {
      success: true,
      data,
      pagination: { total, page, totalPages: Math.ceil(total / limit) },
    };
  } catch (error) {
    console.error('Failed to list articles by account:', error);
    return { success: false, data: [], pagination: { total: 0, page: 1, totalPages: 0 } };
  }
});

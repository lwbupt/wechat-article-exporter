/**
 * 素材库查询 API
 * 支持 type/category/tags/fakeid 筛选
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const type = query.type as string;
  const category = query.category as string;
  const tag = query.tag as string;
  const fakeid = query.fakeid as string;
  const sourceType = query.sourceType as string;
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 50;

  try {
    let sql = 'SELECT * FROM writing_materials WHERE 1=1';
    const params: any[] = [];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (tag) {
      sql += ' AND tags LIKE ?';
      params.push(`%${tag}%`);
    }
    if (fakeid) {
      sql += ' AND fakeid = ?';
      params.push(fakeid);
    }
    if (sourceType) {
      sql += ' AND source_type = ?';
      params.push(sourceType);
    }

    const total = (db.prepare(`SELECT COUNT(*) as count FROM (${sql})`).get(...params) as { count: number }).count;

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(pageSize, (page - 1) * pageSize);

    const materials = db.prepare(sql).all(...params);

    return { success: true, data: { materials, total, page, pageSize } };
  } catch (error) {
    console.error('Failed to load materials:', error);
    return { success: false, error: '加载素材失败' };
  }
});

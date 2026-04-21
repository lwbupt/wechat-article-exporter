/**
 * 获取/设置配置项
 * GET: ?key=xxx  获取单个配置
 */

import db from '~/server/database/index';

export default defineEventHandler(event => {
  const query = getQuery(event);
  const key = query.key as string;

  if (!key) {
    return { success: false, error: 'key is required' };
  }

  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) {
    return { success: false, error: '配置项不存在', data: null };
  }

  return { success: true, data: row.value };
});

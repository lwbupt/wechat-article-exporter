/**
 * 保存配置项
 * POST: { key, value }
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  const body = await readBody(event);
  const { key, value } = body;

  if (!key || value === undefined) {
    return { success: false, error: 'key 和 value 不能为空' };
  }

  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).run(key, value);

  return { success: true };
});

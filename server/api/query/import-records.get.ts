/**
 * 获取爆文导入记录
 */

import db from '~/server/database/index';

export default defineEventHandler(() => {
  const records = db
    .prepare('SELECT * FROM import_records ORDER BY created_at DESC')
    .all();
  return { success: true, data: records };
});

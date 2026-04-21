/**
 * 查询公众号运营列表
 */

import db from '~/server/database/index';

export default defineEventHandler(() => {
  try {
    const records = db.prepare('SELECT id, name, appid, description, category, persona, enabled, ext1, ext2, writing_style_id, layout_template_id, daily_publish_count, publish_time, auto_publish, image_mode, image_count, image_source, image_config, header_content, footer_content, section_prefix, section_suffix, created_at, updated_at FROM managed_accounts ORDER BY created_at DESC').all();
    return { success: true, data: records };
  } catch (error) {
    console.error('Failed to query managed accounts:', error);
    return { success: false, error: '查询失败' };
  }
});

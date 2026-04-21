/**
 * 查询排版模板列表
 */

import db from '~/server/database/index';

export default defineEventHandler(() => {
  try {
    const templates = db
      .prepare('SELECT id, name, description, style_json, is_default FROM layout_templates ORDER BY is_default DESC, id')
      .all();
    return { success: true, data: templates };
  } catch (error) {
    console.error('Failed to load templates:', error);
    return { success: false, error: '加载模板失败' };
  }
});

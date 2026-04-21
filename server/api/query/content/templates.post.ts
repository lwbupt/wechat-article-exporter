/**
 * 新建排版模板
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { name, description, styleJson } = body as { name: string; description?: string; styleJson: string };

    if (!name || !styleJson) {
      return { success: false, error: '名称和样式不能为空' };
    }

    const result = db
      .prepare('INSERT INTO layout_templates (name, description, style_json, is_default) VALUES (?, ?, ?, 0)')
      .run(name, description || '', styleJson);

    return { success: true, data: { id: Number(result.lastInsertRowid) } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '创建失败' };
  }
});

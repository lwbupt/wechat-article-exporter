/**
 * 编辑排版模板
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const id = Number(getRouterParam(event, 'id'));
    const body = await readBody(event);
    const { name, description, styleJson } = body as { name: string; description?: string; styleJson: string };

    if (!id) return { success: false, error: '无效的模板 ID' };
    if (!name || !styleJson) return { success: false, error: '名称和样式不能为空' };

    db.prepare('UPDATE layout_templates SET name = ?, description = ?, style_json = ? WHERE id = ?').run(name, description || '', styleJson, id);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '更新失败' };
  }
});

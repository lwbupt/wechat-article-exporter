/**
 * 删除排版模板
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const id = Number(getRouterParam(event, 'id'));
    if (!id) return { success: false, error: '无效的模板 ID' };

    const tpl = db.prepare('SELECT is_default FROM layout_templates WHERE id = ?').get(id) as any;
    if (!tpl) return { success: false, error: '模板不存在' };
    if (tpl.is_default) return { success: false, error: '默认模板不能删除' };

    db.prepare('DELETE FROM layout_templates WHERE id = ?').run(id);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '删除失败' };
  }
});

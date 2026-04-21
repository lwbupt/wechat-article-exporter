/**
 * 删除公众号运营记录
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { id } = body;

    if (!id) {
      return { success: false, error: 'id 不能为空' };
    }

    db.prepare('DELETE FROM managed_accounts WHERE id = ?').run(id);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete managed account:', error);
    return { success: false, error: '删除失败' };
  }
});

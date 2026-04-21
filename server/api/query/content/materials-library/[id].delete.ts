/**
 * 删除素材
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const id = parseInt(getRouterParam(event, 'id') as string);
    if (!id) {
      return { success: false, error: 'Invalid ID' };
    }

    db.prepare('DELETE FROM writing_materials WHERE id = ?').run(id);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete material:', error);
    return { success: false, error: '删除失败' };
  }
});

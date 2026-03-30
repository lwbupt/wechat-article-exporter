/**
 * 删除分类（级联删除子分类）
 */

import { deleteCategory } from '~/server/database/models/category';

export default defineEventHandler(async event => {
  try {
    const id = parseInt(getRouterParam(event, 'id') as string);
    if (!id) {
      return { success: false, error: 'Invalid category ID' };
    }

    deleteCategory(id);

    return { success: true, message: '分类删除成功' };
  } catch (error) {
    console.error('Failed to delete category:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

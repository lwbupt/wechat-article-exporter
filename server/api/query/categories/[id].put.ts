/**
 * 更新分类
 */

import { updateCategory } from '~/server/database/models/category';

export default defineEventHandler(async event => {
  try {
    const id = parseInt(getRouterParam(event, 'id') as string);
    if (!id) {
      return { success: false, error: 'Invalid category ID' };
    }

    const body = await readBody(event);
    const { name, parentId, sortOrder, imageMode, imageCount, imageSource } = body;

    if (!name || !name.trim()) {
      return { success: false, error: '分类名称不能为空' };
    }

    updateCategory(id, name.trim(), parentId ?? null, sortOrder ?? undefined, imageMode, imageCount, imageSource);

    return { success: true, message: '分类更新成功' };
  } catch (error) {
    console.error('Failed to update category:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

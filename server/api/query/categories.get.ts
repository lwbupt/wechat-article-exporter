/**
 * 获取分类列表（树形结构）
 */

import { getCategoriesTree } from '~/server/database/models/category';

export default defineEventHandler(() => {
  try {
    const tree = getCategoriesTree();
    return {
      success: true,
      data: tree,
    };
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
    };
  }
});

/**
 * 新增分类
 */

import { insertCategory } from '~/server/database/models/category';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { name, parentId } = body;

    if (!name || !name.trim()) {
      return {
        success: false,
        error: '分类名称不能为空',
      };
    }

    insertCategory(name.trim(), parentId || null);

    return {
      success: true,
      message: `分类 "${name.trim()}" 添加成功`,
    };
  } catch (error) {
    console.error('Failed to add category:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

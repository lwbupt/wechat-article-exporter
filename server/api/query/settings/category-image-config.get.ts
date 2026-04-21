/**
 * 获取分类配图配置
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const category = query.category as string;

  if (!category) {
    return { success: false, error: '缺少分类名称' };
  }

  try {
    const row = db.prepare('SELECT image_mode, image_count, image_config, image_source FROM categories WHERE name = ?').get(category) as {
      image_mode: string;
      image_count: number;
      image_config: string;
      image_source: string;
    } | undefined;

    if (!row) {
      return { success: true, data: { image_mode: 'search', image_count: 2, image_source: 'free_search' } };
    }

    return {
      success: true,
      data: {
        image_mode: row.image_mode || 'search',
        image_count: row.image_count || 2,
        image_config: row.image_config || '{}',
        image_source: row.image_source || 'free_search',
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '查询失败' };
  }
});

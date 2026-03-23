/**
 * 清理单篇文章的旧数据
 * 用于删除使用旧的 aid 生成逻辑创建的文章
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const url = query.url as string;

    if (!url) {
      return {
        success: false,
        error: 'url parameter is required',
      };
    }

    // 删除指定 link 的文章
    const stmt = db.prepare('DELETE FROM articles WHERE link = ?');
    const result = stmt.run(url);

    return {
      success: true,
      message: `Deleted ${result.changes} article(s)`,
      changes: result.changes,
      url,
    };
  } catch (error) {
    console.error('Failed to delete article:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

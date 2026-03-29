/**
 * 更新文章的 fakeid（从占位符更新为真实 fakeid）
 * 同时清理空的占位符公众号记录
 */

import { deleteAccountIfEmpty } from '~/server/database/models/account';
import db from '~/server/database';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { link, old_fakeid, new_fakeid } = body;

    if (!link || !old_fakeid || !new_fakeid) {
      return {
        success: false,
        error: 'Missing required fields: link, old_fakeid, new_fakeid',
      };
    }

    if (old_fakeid === new_fakeid) {
      return { success: true, message: 'No change needed' };
    }

    // 1. 更新文章的 fakeid
    const stmt = db.prepare('UPDATE articles SET fakeid = ? WHERE link = ? AND fakeid = ?');
    const result = stmt.run(new_fakeid, link, old_fakeid);

    // 2. 如果旧 fakeid 是占位符，检查是否还有其他文章使用它，没有则删除空公众号记录
    if (old_fakeid === 'SINGLE_ARTICLE_FAKEID') {
      deleteAccountIfEmpty(old_fakeid);
    }

    return {
      success: true,
      message: `Updated fakeid for article: ${link}`,
      changes: result.changes,
    };
  } catch (error) {
    console.error('Failed to update article fakeid:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

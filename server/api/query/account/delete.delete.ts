/**
 * 删除公众号及其关联数据
 */

import { deleteAccounts } from '~/server/database/models/account';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const fakeids = query.fakeids;

    if (!fakeids) {
      return {
        success: false,
        error: 'fakeids is required',
      };
    }

    // 支持两种格式：逗号分隔的字符串或数组
    const idsToDelete = Array.isArray(fakeids) ? fakeids : (fakeids as string).split(',');

    if (idsToDelete.length === 0) {
      return {
        success: false,
        error: 'No accounts to delete',
      };
    }

    console.log(`[API] Deleting accounts: ${idsToDelete.join(', ')}`);

    // 调用数据库删除函数
    deleteAccounts(idsToDelete);

    return {
      success: true,
      message: `Successfully deleted ${idsToDelete.length} account(s)`,
      deletedCount: idsToDelete.length,
    };
  } catch (error) {
    console.error('Failed to delete accounts:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

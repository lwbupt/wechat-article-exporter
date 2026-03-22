/**
 * 查询数据库统计信息
 */

import { getDatabaseStats } from '~/server/database';
import { getAllAccounts } from '~/server/database/models/account';

export default defineEventHandler(async event => {
  try {
    const stats = getDatabaseStats();
    const accounts = getAllAccounts();

    // 计算每个账号的文章数
    const accountStats = accounts.map(account => ({
      fakeid: account.fakeid,
      nickname: account.nickname || 'Unknown',
      articles: account.articles || 0,
    }));

    return {
      success: true,
      data: {
        ...stats,
        accounts: accountStats,
      },
    };
  } catch (error) {
    console.error('Failed to query stats:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    };
  }
});

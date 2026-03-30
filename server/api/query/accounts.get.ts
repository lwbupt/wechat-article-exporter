/**
 * 查询数据库中的公众号列表
 * 支持筛选、分页、排序
 */

import { getAccountByFakeid, getAllAccounts } from '~/server/database/models/account';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);

    // 筛选参数
    const filter = {
      nickname: (query.nickname as string)?.trim(),
      fakeid: (query.fakeid as string)?.trim(),
      is_monitored: query.is_monitored === '1' ? true : query.is_monitored === '0' ? false : undefined,
    };

    // 分页参数
    const page = Math.max(1, parseInt((query.page as string) || '1'));
    const limit = Math.min(100, Math.max(1, parseInt((query.limit as string) || '50')));
    const offset = (page - 1) * limit;

    // 排序参数
    const sortBy = (query.sortBy as string) || 'created_at';
    const sortOrder = (query.sortOrder as string) === 'asc' ? 'ASC' : 'DESC';

    // 获取所有数据（TODO: 优化为数据库层筛选）
    let accounts = getAllAccounts();

    // 应用筛选
    if (filter.nickname) {
      accounts = accounts.filter(acc => acc.nickname?.toLowerCase().includes(filter.nickname!.toLowerCase()));
    }
    if (filter.fakeid) {
      accounts = accounts.filter(acc => acc.fakeid === filter.fakeid);
    }
    if (filter.is_monitored !== undefined) {
      accounts = accounts.filter(acc => !!acc.is_monitored === filter.is_monitored);
    }

    // 应用排序
    accounts.sort((a, b) => {
      const aVal = a[sortBy as keyof typeof a] || '';
      const bVal = b[sortBy as keyof typeof b] || '';
      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return sortOrder === 'ASC' ? comparison : -comparison;
    });

    // 分页
    const total = accounts.length;
    const data = accounts.slice(offset, offset + limit);

    return {
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error('Failed to query accounts:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
      pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
    };
  }
});

/**
 * 查询数据库中的文章列表
 * 支持筛选、分页、排序
 */

import { getArticleCountByFakeid, getArticlesByFakeid } from '~/server/database/models/article';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const fakeid = query.fakeid as string;

    if (!fakeid) {
      return {
        success: false,
        error: 'fakeid is required',
        data: [],
        pagination: { total: 0, page: 1, limit: 100, totalPages: 0 },
      };
    }

    // 筛选参数
    const filter = {
      title: (query.title as string)?.trim(),
      author: (query.author as string)?.trim(),
      isOriginal: query.is_original === 'true' ? true : query.is_original === 'false' ? false : undefined,
      contentDownload: query.content_download === 'true',
      commentDownload: query.comment_download === 'true',
    };

    // 分页参数
    const page = Math.max(1, parseInt((query.page as string) || '1'));
    const limit = Math.min(100, Math.max(1, parseInt((query.limit as string) || '100')));
    const offset = (page - 1) * limit;

    // 排序参数
    const sortBy = (query.sortBy as string) || 'datetime';
    const sortOrder = (query.sortOrder as string) === 'asc' ? 'ASC' : 'DESC';

    // 获取所有数据（TODO: 优化为数据库层筛选）
    let articles = getArticlesByFakeid(fakeid, 10000, 0); // 获取所有数据

    // 应用筛选
    if (filter.title) {
      articles = articles.filter(art => art.title?.toLowerCase().includes(filter.title!.toLowerCase()));
    }
    if (filter.author) {
      articles = articles.filter(art => art.author_name?.toLowerCase().includes(filter.author!.toLowerCase()));
    }
    if (filter.isOriginal !== undefined) {
      articles = articles.filter(art => art.is_original === filter.isOriginal);
    }
    if (filter.contentDownload) {
      articles = articles.filter(art => art.content_download === 1);
    }
    if (filter.commentDownload) {
      articles = articles.filter(art => art.comment_download === 1);
    }

    // 应用排序
    articles.sort((a, b) => {
      const aVal = a[sortBy as keyof typeof a] || 0;
      const bVal = b[sortBy as keyof typeof b] || 0;
      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return sortOrder === 'ASC' ? comparison : -comparison;
    });

    // 分页
    const total = articles.length;
    const data = articles.slice(offset, offset + limit);

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
    console.error('Failed to query articles:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
      pagination: { total: 0, page: 1, limit: 100, totalPages: 0 },
    };
  }
});

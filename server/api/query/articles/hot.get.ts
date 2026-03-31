/**
 * 查询所有 is_hot 文章列表
 * 支持分页、排序
 */

import db from '~/server/database/index';
import { getArticleMetadata } from '~/server/database/models/metadata';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);

    // 分页参数
    const page = Math.max(1, parseInt((query.page as string) || '1'));
    const limit = Math.min(100, Math.max(1, parseInt((query.limit as string) || '20')));
    const offset = (page - 1) * limit;

    // 排序参数
    const sortBy = (query.sortBy as string) || 'datetime';
    const sortOrder = (query.sortOrder as string) === 'asc' ? 'ASC' : 'DESC';

    // 获取总数
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM articles WHERE is_hot = 1');
    const totalResult = countStmt.get() as { count: number };
    const total = totalResult.count;

    // 查询数据
    const sql = `SELECT * FROM articles WHERE is_hot = 1 ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
    const stmt = db.prepare(sql);
    const articles = stmt.all(limit, offset) as any[];

    // 关联元数据
    const data = articles.map(article => {
      const is_deleted = article.is_deleted === 1;
      const content_download = article.content_download === 1;
      const comment_download = article.comment_download === 1;
      const metadata_download = article.metadata_download === 1;
      const is_original = article.is_original === 1;
      const _single = article._single === 1;

      const metadata = getArticleMetadata(article.id);

      return {
        ...article,
        is_deleted,
        content_download,
        comment_download,
        metadata_download,
        is_original,
        _single,
        contentDownload: content_download,
        commentDownload: comment_download,
        metadataDownload: metadata_download,
        update_time: article.update_time || article.datetime || article.create_time,
        readNum: metadata?.read_num || 0,
        oldLikeNum: metadata?.old_like_num || 0,
        likeNum: metadata?.like_num || 0,
        shareNum: metadata?.share_num || 0,
        commentNum: metadata?.comment_num || 0,
      };
    });

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
    console.error('Failed to query hot articles:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
      pagination: { total: 0, page: 1, limit: 20, totalPages: 0 },
    };
  }
});

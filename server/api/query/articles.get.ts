/**
 * 查询数据库中的文章列表
 * 支持筛选、分页、排序
 */

import db from '~/server/database/index';
import { getArticleCountByFakeid, getArticlesByFakeid } from '~/server/database/models/article';
import { getArticleMetadata } from '~/server/database/models/metadata';

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
      isDeleted: query.is_deleted === 'true' ? true : query.is_deleted === 'false' ? false : undefined,
      status: (query.status as string)?.trim(),
    };

    // 分页参数
    const page = Math.max(1, parseInt((query.page as string) || '1'));
    const limit = Math.min(100, Math.max(1, parseInt((query.limit as string) || '100')));
    const offset = (page - 1) * limit;

    // 排序参数
    const sortBy = (query.sortBy as string) || 'datetime';
    const sortOrder = (query.sortOrder as string) === 'asc' ? 'ASC' : 'DESC';

    // 构建数据库查询
    let sql = 'SELECT * FROM articles WHERE fakeid = ?';
    const params: any[] = [fakeid];

    // 应用筛选（在数据库层）
    if (filter.title) {
      sql += ' AND title LIKE ?';
      params.push(`%${filter.title}%`);
    }
    if (filter.author) {
      sql += ' AND author_name LIKE ?';
      params.push(`%${filter.author}%`);
    }
    if (filter.isOriginal !== undefined) {
      sql += ' AND is_original = ?';
      params.push(filter.isOriginal ? 1 : 0);
    }
    if (filter.contentDownload) {
      sql += ' AND content_download = 1';
    }
    if (filter.commentDownload) {
      sql += ' AND comment_download = 1';
    }
    if (filter.isDeleted !== undefined) {
      sql += ' AND is_deleted = ?';
      params.push(filter.isDeleted ? 1 : 0);
    }
    if (filter.status) {
      sql += ' AND _status = ?';
      params.push(filter.status);
    }

    // 获取总数
    const countStmt = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as count'));
    const totalResult = countStmt.get(...params) as { count: number };
    const total = totalResult.count;

    // 添加排序和分页
    sql += ` ORDER BY ${sortBy} ${sortOrder}`;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    // 执行查询
    const stmt = db.prepare(sql);
    let articles = stmt.all(...params) as any[];

    // 关联元数据信息
    articles = articles.map(article => {
      // 转换布尔字段
      const is_deleted = article.is_deleted === 1;
      const content_download = article.content_download === 1;
      const comment_download = article.comment_download === 1;
      const metadata_download = article.metadata_download === 1;
      const is_original = article.is_original === 1;
      const _single = article._single === 1;

      // 获取元数据
      const metadata = getArticleMetadata(article.id);

      return {
        ...article,
        is_deleted,
        content_download,
        comment_download,
        metadata_download,
        is_original,
        _single,
        // 前端使用的字段名
        contentDownload: content_download,
        commentDownload: comment_download,
        metadataDownload: metadata_download,
        // 确保 update_time 有值，优先使用 datetime 字段
        update_time: article.update_time || article.datetime || article.create_time,
        // 元数据字段
        readNum: metadata?.read_num || 0,
        oldLikeNum: metadata?.old_like_num || 0,
        likeNum: metadata?.like_num || 0,
        shareNum: metadata?.share_num || 0,
        commentNum: metadata?.comment_num || 0,
      };
    });

    return {
      success: true,
      data: articles,
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

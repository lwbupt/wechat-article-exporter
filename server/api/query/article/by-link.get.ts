/**
 * 根据 link 查询单篇文章
 * 用于单篇文章下载页面
 */

import db from '~/server/database/index';
import { getArticleMetadata } from '~/server/database/models/metadata';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const link = query.link as string;

    if (!link) {
      return {
        success: false,
        error: 'link is required',
        data: null,
      };
    }

    // 根据 link 查询文章
    const stmt = db.prepare('SELECT * FROM articles WHERE link = ?');
    const article = stmt.get(link) as any | undefined;

    if (!article) {
      return {
        success: false,
        error: 'Article not found',
        data: null,
      };
    }

    // 获取元数据
    const metadata = getArticleMetadata(article.id);

    // 转换布尔字段
    const is_deleted = article.is_deleted === 1;
    const content_download = article.content_download === 1;
    const comment_download = article.comment_download === 1;
    const metadata_download = article.metadata_download === 1;
    const is_original = article.is_original === 1;
    const _single = article._single === 1;

    return {
      success: true,
      data: {
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
        // 确保 update_time 有值
        update_time: article.update_time || article.datetime || article.create_time,
        // 元数据字段
        readNum: metadata?.read_num || 0,
        oldLikeNum: metadata?.old_like_num || 0,
        likeNum: metadata?.like_num || 0,
        shareNum: metadata?.share_num || 0,
        commentNum: metadata?.comment_num || 0,
      },
    };
  } catch (error) {
    console.error('Failed to query article by link:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    };
  }
});

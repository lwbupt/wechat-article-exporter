/**
 * 保存单篇文章到数据库
 * 用于单篇文章下载页面
 */

import { upsertArticle } from '~/server/database/models/article';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const {
      fakeid,
      aid,
      title,
      link,
      author_name,
      digest,
      cover,
      create_time,
      update_time,
      itemidx,
      _status,
      content_download,
      comment_download,
    } = body;

    if (!fakeid || !aid || !link) {
      return {
        success: false,
        error: 'Missing required fields: fakeid, aid, link',
      };
    }

    // 保存文章（公众号记录由 tryAddAccountFromHtml 在下载成功后创建）
    upsertArticle({
      fakeid,
      aid,
      type: 0,
      title: title || '未命名文章',
      digest: digest || '',
      cover: cover || undefined,
      author_name: author_name || '--',
      datetime: update_time || create_time || Math.floor(Date.now() / 1000),
      create_time: create_time || Math.floor(Date.now() / 1000),
      link,
      itemidx: itemidx || 1,
      _status: _status ?? '',
      _single: true,
      is_hot: true,
      content_download: content_download || false,
      comment_download: comment_download || false,
    });

    return {
      success: true,
      message: 'Article saved successfully',
    };
  } catch (error) {
    console.error('Failed to save article:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

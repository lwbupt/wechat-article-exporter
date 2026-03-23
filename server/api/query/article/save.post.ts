/**
 * 保存单篇文章到数据库
 * 用于单篇文章下载页面
 */

import { upsertAccount } from '~/server/database/models/account';
import { upsertArticle } from '~/server/database/models/article';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { fakeid, aid, title, link, author_name, digest, cover, create_time, update_time, itemidx } = body;

    if (!fakeid || !aid || !link) {
      return {
        success: false,
        error: 'Missing required fields: fakeid, aid, link',
      };
    }

    // 先保存公众号（如果不存在）
    upsertAccount({
      fakeid,
      nickname: null,
      round_head_img: null,
      signature: null,
      service_type: 0,
      completed: false,
      count: 0,
      articles: 0,
      total_count: 0,
      create_time: null,
      update_time: null,
      last_update_time: null,
    });

    // 保存文章
    upsertArticle({
      fakeid,
      aid,
      type: 0,
      title: title || '未命名文章',
      digest: digest || '',
      content: null,
      cover: cover || null,
      author_name: author_name || '--',
      copyright_stat: 0,
      is_original: false,
      datetime: create_time || Math.floor(Date.now() / 1000),
      create_time: create_time || Math.floor(Date.now() / 1000),
      link,
      itemidx: itemidx || 1,
      item_show_type: 0,
      _status: '',
      _single: true,
      is_deleted: false,
      content_download: false,
      comment_download: false,
      metadata_download: false,
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

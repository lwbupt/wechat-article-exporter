/**
 * 保存单篇文章到数据库
 * 用于单篇文章下载页面
 */

import { getAccountByFakeid, insertAccountIfNotExists } from '~/server/database/models/account';
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

    // 仅在公众号不存在时插入空记录，不覆盖已有数据
    const existingAccount = getAccountByFakeid(fakeid);
    if (!existingAccount) {
      insertAccountIfNotExists({
        fakeid,
      });
    }

    // 保存文章
    upsertArticle({
      fakeid,
      aid,
      type: 0,
      title: title || '未命名文章',
      digest: digest || '',
      cover: cover || undefined,
      author_name: author_name || '--',
      datetime: create_time || Math.floor(Date.now() / 1000),
      create_time: create_time || Math.floor(Date.now() / 1000),
      link,
      itemidx: itemidx || 1,
      _status: '',
      _single: true,
      is_hot: true,
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

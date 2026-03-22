/**
 * 查询单篇文章详情
 */

import { getArticleByAid } from '~/server/database/models/article';
import { getArticleHtml } from '~/server/database/models/html';
import { getArticleMetadata } from '~/server/database/models/metadata';

export default defineEventHandler(async event => {
  try {
    const id = getRouterParam(event, 'id');
    const query = getQuery(event);
    const fakeid = query.fakeid as string;

    if (!id || !fakeid) {
      return {
        success: false,
        error: 'id and fakeid are required',
        data: null,
      };
    }

    // 获取文章基本信息
    const article = getArticleByAid(fakeid, id);
    if (!article) {
      return {
        success: false,
        error: 'Article not found',
        data: null,
      };
    }

    // 获取 HTML 内容
    const html = getArticleHtml(article.id);

    // 获取元数据
    const metadata = getArticleMetadata(article.id);

    return {
      success: true,
      data: {
        ...article,
        html: html?.html_content || null,
        metadata: metadata || null,
      },
    };
  } catch (error) {
    console.error('Failed to query article:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    };
  }
});

/**
 * 根据文章 URL 获取 HTML 内容
 * 从 article_html 表读取，返回给前端
 */

import { getArticleHtmlByUrl } from '~/server/database/models/html';

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const url = query.url as string;

    if (!url) {
      return {
        success: false,
        error: 'url is required',
        data: null,
      };
    }

    const htmlRecord = getArticleHtmlByUrl(url);
    if (!htmlRecord) {
      return {
        success: false,
        error: 'HTML content not found',
        data: null,
      };
    }

    return {
      success: true,
      data: {
        html: htmlRecord.html_content,
        file_size: htmlRecord.file_size,
        download_time: htmlRecord.download_time,
      },
    };
  } catch (error) {
    console.error('Failed to get HTML content:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    };
  }
});

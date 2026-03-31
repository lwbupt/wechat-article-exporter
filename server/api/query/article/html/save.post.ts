/**
 * 保存文章 HTML 内容到后端 SQLite
 * 接收 url + html 字符串，写入 article_html 表
 */

import db from '~/server/database/index';
import { getArticleIdByLink, upsertArticleHtml } from '~/server/database/models/html';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { url, html } = body;

    if (!url || !html) {
      return {
        success: false,
        error: 'Missing required fields: url, html',
      };
    }

    const articleId = getArticleIdByLink(url);
    if (!articleId) {
      return {
        success: false,
        error: `Article not found for url: ${url}`,
      };
    }

    upsertArticleHtml({
      article_id: articleId,
      html_content: html,
      file_size: html.length,
    });

    // 更新文章内容下载状态
    const stmt = db.prepare(
      'UPDATE articles SET content_download = ?, content_download_time = ? WHERE id = ?'
    );
    stmt.run(1, Math.floor(Date.now() / 1000), articleId);

    return {
      success: true,
      message: 'HTML content saved successfully',
    };
  } catch (error) {
    console.error('Failed to save HTML content:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

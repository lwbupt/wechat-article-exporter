/**
 * HTML 内容数据模型
 */

import db from '../index';

export interface ArticleHtml {
  article_id: number;
  html_content: string;
  file_size?: number;
}

/**
 * 保存文章 HTML 内容
 */
export function upsertArticleHtml(html: ArticleHtml): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO article_html (article_id, html_content, file_size)
    VALUES (?, ?, ?)
  `);

  stmt.run(html.article_id, html.html_content, html.file_size || html.html_content.length);
}

/**
 * 获取文章 HTML 内容
 */
export function getArticleHtml(articleId: number): any | null {
  const stmt = db.prepare('SELECT * FROM article_html WHERE article_id = ?');
  const result = stmt.get(articleId) as any;
  return result || null;
}

/**
 * 删除文章 HTML 内容
 */
export function deleteArticleHtml(articleId: number): void {
  const stmt = db.prepare('DELETE FROM article_html WHERE article_id = ?');
  stmt.run(articleId);
}

/**
 * 批量保存文章 HTML 内容
 */
export function upsertArticleHtmlList(htmlList: ArticleHtml[]): void {
  const insert = db.transaction((items: ArticleHtml[]) => {
    for (const html of items) {
      upsertArticleHtml(html);
    }
  });
  insert(htmlList);
}

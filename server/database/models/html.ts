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
    INSERT OR REPLACE INTO article_html (article_id, html_content, file_size, download_time, is_valid)
    VALUES (?, ?, ?, ?, 1)
  `);

  stmt.run(html.article_id, html.html_content, html.file_size || html.html_content.length, Math.floor(Date.now() / 1000));
}

/**
 * 获取文章 HTML 内容（按 article_id）
 */
export function getArticleHtml(articleId: number): any | null {
  const stmt = db.prepare('SELECT * FROM article_html WHERE article_id = ?');
  const result = stmt.get(articleId) as any;
  return result || null;
}

/**
 * 获取文章 HTML 内容（按文章 link URL）
 */
export function getArticleHtmlByUrl(link: string): any | null {
  const stmt = db.prepare(`
    SELECT ah.* FROM article_html ah
    JOIN articles a ON a.id = ah.article_id
    WHERE a.link = ?
  `);
  const result = stmt.get(link) as any;
  return result || null;
}

/**
 * 通过文章 link URL 获取 article_id
 */
export function getArticleIdByLink(link: string): number | null {
  const stmt = db.prepare('SELECT id FROM articles WHERE link = ?');
  const result = stmt.get(link) as { id: number } | undefined;
  return result?.id ?? null;
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

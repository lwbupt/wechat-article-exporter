/**
 * 文章数据模型
 */

import db from '../index';

export interface Article {
  fakeid: string;
  aid: string;
  type?: number;
  title?: string;
  digest?: string;
  content?: string;
  cover?: string;
  author_name?: string;
  copyright_stat?: number;
  is_original?: boolean;
  datetime?: number;
  create_time?: number;
  link?: string;
  itemidx?: number;
  item_show_type?: number;
  _status?: string;
  _single?: boolean;
  is_deleted?: boolean;
  content_download?: boolean;
  comment_download?: boolean;
  metadata_download?: boolean;
  content_download_time?: number;
  comment_download_time?: number;
  metadata_download_time?: number;
  extra_fields?: string;
}

/**
 * 插入或更新文章
 */
export function upsertArticle(article: Article): void {
  const stmt = db.prepare(`
    INSERT INTO articles (
      fakeid, aid, type, title, digest, content, cover, author_name,
      copyright_stat, is_original, datetime, create_time, link,
      itemidx, item_show_type, _status, _single, is_deleted, content_download,
      comment_download, metadata_download, content_download_time,
      comment_download_time, metadata_download_time, extra_fields
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fakeid, aid) DO UPDATE SET
      title = excluded.title,
      digest = excluded.digest,
      content = excluded.content,
      cover = excluded.cover,
      author_name = excluded.author_name,
      copyright_stat = excluded.copyright_stat,
      is_original = excluded.is_original,
      datetime = excluded.datetime,
      create_time = excluded.create_time,
      link = excluded.link,
      itemidx = excluded.itemidx,
      item_show_type = excluded.item_show_type,
      _status = excluded._status,
      _single = excluded._single,
      is_deleted = excluded.is_deleted,
      content_download = excluded.content_download,
      comment_download = excluded.comment_download,
      metadata_download = excluded.metadata_download,
      content_download_time = excluded.content_download_time,
      comment_download_time = excluded.comment_download_time,
      metadata_download_time = excluded.metadata_download_time,
      extra_fields = excluded.extra_fields
  `);

  stmt.run(
    article.fakeid,
    article.aid,
    article.type || 0,
    article.title || null,
    article.digest || null,
    article.content || null,
    article.cover || null,
    article.author_name || null,
    article.copyright_stat || 0,
    article.is_original ? 1 : 0,
    article.datetime || null,
    article.create_time || null,
    article.link || null,
    article.itemidx || 1,
    article.item_show_type || 0,
    article._status || 'pending',
    article._single ? 1 : 0,
    article.is_deleted ? 1 : 0,
    article.content_download ? 1 : 0,
    article.comment_download ? 1 : 0,
    article.metadata_download ? 1 : 0,
    article.content_download_time || null,
    article.comment_download_time || null,
    article.metadata_download_time || null,
    article.extra_fields || null
  );
}

/**
 * 批量插入或更新文章
 */
export function upsertArticles(articles: Article[]): void {
  const insert = db.transaction((items: Article[]) => {
    for (const article of items) {
      upsertArticle(article);
    }
  });
  insert(articles);
}

/**
 * 根据 fakeid 获取文章列表
 */
export function getArticlesByFakeid(fakeid: string, limit = 100, offset = 0): any[] {
  const stmt = db.prepare(`
    SELECT * FROM articles
    WHERE fakeid = ?
    ORDER BY datetime DESC
    LIMIT ? OFFSET ?
  `);
  return stmt.all(fakeid, limit, offset);
}

/**
 * 根据 aid 获取文章
 */
export function getArticleByAid(fakeid: string, aid: string): any | null {
  const stmt = db.prepare('SELECT * FROM articles WHERE fakeid = ? AND aid = ?');
  const result = stmt.get(fakeid, aid) as any;
  return result || null;
}

/**
 * 获取文章总数（按公众号）
 */
export function getArticleCountByFakeid(fakeid: string): number {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM articles WHERE fakeid = ?');
  const result = stmt.get(fakeid) as { count: number };
  return result.count;
}

/**
 * 更新文章状态
 */
export function updateArticleStatus(fakeid: string, aid: string, status: string): void {
  const stmt = db.prepare('UPDATE articles SET _status = ? WHERE fakeid = ? AND aid = ?');
  stmt.run(status, fakeid, aid);
}

/**
 * 更新文章删除状态
 */
export function updateArticleDeleted(fakeid: string, aid: string, isDeleted: boolean): void {
  const stmt = db.prepare('UPDATE articles SET is_deleted = ? WHERE fakeid = ? AND aid = ?');
  stmt.run(isDeleted ? 1 : 0, fakeid, aid);
}

/**
 * 更新文章内容下载状态
 */
export function updateArticleContentDownload(fakeid: string, aid: string, downloaded: boolean): void {
  const stmt = db.prepare(
    'UPDATE articles SET content_download = ?, content_download_time = ? WHERE fakeid = ? AND aid = ?'
  );
  stmt.run(downloaded ? 1 : 0, downloaded ? Math.floor(Date.now() / 1000) : null, fakeid, aid);
}

/**
 * 更新文章评论下载状态
 */
export function updateArticleCommentDownload(fakeid: string, aid: string, downloaded: boolean): void {
  const stmt = db.prepare(
    'UPDATE articles SET comment_download = ?, comment_download_time = ? WHERE fakeid = ? AND aid = ?'
  );
  stmt.run(downloaded ? 1 : 0, downloaded ? Math.floor(Date.now() / 1000) : null, fakeid, aid);
}

/**
 * 更新文章元数据下载状态
 */
export function updateArticleMetadataDownload(fakeid: string, aid: string, downloaded: boolean): void {
  const stmt = db.prepare(
    'UPDATE articles SET metadata_download = ?, metadata_download_time = ? WHERE fakeid = ? AND aid = ?'
  );
  stmt.run(downloaded ? 1 : 0, downloaded ? Math.floor(Date.now() / 1000) : null, fakeid, aid);
}

/**
 * 根据 link 获取文章
 */
export function getArticleByLink(link: string): any | null {
  const stmt = db.prepare('SELECT * FROM articles WHERE link = ?');
  const result = stmt.get(link) as any;
  return result || null;
}

/**
 * 根据 link 获取 fakeid 和 aid
 */
export function getArticleFakeidAidByLink(link: string): { fakeid: string; aid: string } | null {
  const stmt = db.prepare('SELECT fakeid, aid FROM articles WHERE link = ?');
  const result = stmt.get(link) as { fakeid: string; aid: string } | undefined;
  return result || null;
}

/**
 * 删除文章
 */
export function deleteArticle(fakeid: string, aid: string): void {
  const stmt = db.prepare('DELETE FROM articles WHERE fakeid = ? AND aid = ?');
  stmt.run(fakeid, aid);
}

/**
 * 删除公众号的所有文章
 */
export function deleteArticlesByFakeid(fakeid: string): void {
  const stmt = db.prepare('DELETE FROM articles WHERE fakeid = ?');
  stmt.run(fakeid);
}

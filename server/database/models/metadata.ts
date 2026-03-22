/**
 * 元数据模型 (阅读量、点赞等)
 */

import db from '../index';

export interface ArticleMetadata {
  article_id: number;
  read_num?: number;
  like_num?: number;
  comment_num?: number;
  reward_num?: number;
  share_num?: number;
  real_read_num?: number;
  real_like_num?: number;
  picked_num?: number;
  play_num?: number;
}

/**
 * 保存文章元数据
 */
export function upsertArticleMetadata(metadata: ArticleMetadata): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO article_html (
      article_id, read_num, like_num, comment_num, reward_num, share_num,
      real_read_num, real_like_num, picked_num, play_num
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    metadata.article_id,
    metadata.read_num || 0,
    metadata.like_num || 0,
    metadata.comment_num || 0,
    metadata.reward_num || 0,
    metadata.share_num || 0,
    metadata.real_read_num || 0,
    metadata.real_like_num || 0,
    metadata.picked_num || 0,
    metadata.play_num || 0
  );
}

/**
 * 获取文章元数据
 */
export function getArticleMetadata(articleId: number): any | null {
  const stmt = db.prepare('SELECT * FROM article_metadata WHERE article_id = ?');
  const result = stmt.get(articleId) as any;
  return result || null;
}

/**
 * 删除文章元数据
 */
export function deleteArticleMetadata(articleId: number): void {
  const stmt = db.prepare('DELETE FROM article_metadata WHERE article_id = ?');
  stmt.run(articleId);
}

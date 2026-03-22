/**
 * 评论数据模型
 */

import db from '../index';

export interface Comment {
  article_id: number;
  content_id: string;
  content?: string;
  like_num?: number;
  reply_id?: number;
  is_friend?: boolean;
  is_top?: boolean;
  create_time?: number;
  reply_comment_id?: string;
}

export interface CommentReply {
  comment_id: number;
  content_id: string;
  content?: string;
  like_num?: number;
  create_time?: number;
}

/**
 * 插入评论
 */
export function insertComment(comment: Comment): number {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO comments (
      article_id, content_id, content, like_num, reply_id,
      is_friend, is_top, create_time, reply_comment_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    comment.article_id,
    comment.content_id,
    comment.content || null,
    comment.like_num || 0,
    comment.reply_id || 0,
    comment.is_friend ? 1 : 0,
    comment.is_top ? 1 : 0,
    comment.create_time || null,
    comment.reply_comment_id || null
  );

  return result.lastInsertRowid as number;
}

/**
 * 批量插入评论
 */
export function insertComments(comments: Comment[]): void {
  const insert = db.transaction((items: Comment[]) => {
    for (const comment of items) {
      insertComment(comment);
    }
  });
  insert(comments);
}

/**
 * 插入评论回复
 */
export function insertCommentReply(reply: CommentReply): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO comment_replies (
      comment_id, content_id, content, like_num, create_time
    ) VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(reply.comment_id, reply.content_id, reply.content || null, reply.like_num || 0, reply.create_time || null);
}

/**
 * 批量插入评论回复
 */
export function insertCommentReplies(replies: CommentReply[]): void {
  const insert = db.transaction((items: CommentReply[]) => {
    for (const reply of items) {
      insertCommentReply(reply);
    }
  });
  insert(replies);
}

/**
 * 获取文章的所有评论
 */
export function getCommentsByArticleId(articleId: number): any[] {
  const stmt = db.prepare(`
    SELECT * FROM comments
    WHERE article_id = ?
    ORDER BY is_top DESC, create_time DESC
  `);
  return stmt.all(articleId);
}

/**
 * 获取评论的所有回复
 */
export function getRepliesByCommentId(commentId: number): any[] {
  const stmt = db.prepare(`
    SELECT * FROM comment_replies
    WHERE comment_id = ?
    ORDER BY create_time ASC
  `);
  return stmt.all(commentId);
}

/**
 * 获取文章的评论总数
 */
export function getCommentCountByArticleId(articleId: number): number {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM comments WHERE article_id = ?');
  const result = stmt.get(articleId) as { count: number };
  return result.count;
}

/**
 * 删除文章的所有评论
 */
export function deleteCommentsByArticleId(articleId: number): void {
  const stmt = db.prepare('DELETE FROM comments WHERE article_id = ?');
  stmt.run(articleId);
}

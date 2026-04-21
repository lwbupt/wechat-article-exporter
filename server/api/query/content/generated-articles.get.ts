/**
 * 查询已生成的备选文章
 * GET: ?topicId=xxx 或 ?page=1&pageSize=20
 */

import db from '~/server/database/index';

interface GeneratedArticle {
  id: number;
  topic_id: number;
  account_id: number;
  title: string;
  outline: string;
  content: string;
  category: string;
  publish_status: string;
  created_at: string;
}

export default defineEventHandler(event => {
  const query = getQuery(event);
  const topicId = query.topicId as string;
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 20;

  if (topicId) {
    const articles = db
      .prepare('SELECT id, topic_id, account_id, title, category, publish_status, created_at FROM generated_articles WHERE topic_id = ? ORDER BY created_at DESC')
      .all(topicId) as GeneratedArticle[];
    return { success: true, data: articles };
  }

  const offset = (page - 1) * pageSize;
  const articles = db
    .prepare('SELECT id, topic_id, account_id, title, category, publish_status, created_at FROM generated_articles ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(pageSize, offset) as GeneratedArticle[];

  const total = (db.prepare('SELECT COUNT(*) as count FROM generated_articles').get() as { count: number }).count;

  return { success: true, data: { articles, total, page, pageSize } };
});

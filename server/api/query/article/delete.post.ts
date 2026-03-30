/**
 * 批量删除文章
 * 根据 fakeid + aid 从数据库中删除文章（外键 CASCADE 会自动删除关联的 html、metadata、comments 等）
 */

import { deleteArticle } from '~/server/database/models/article';

interface DeleteArticlesBody {
  articles: Array<{ fakeid: string; aid: string }>;
}

export default defineEventHandler(async event => {
  try {
    const body = (await readBody(event)) as DeleteArticlesBody;

    if (!body.articles || !Array.isArray(body.articles)) {
      return {
        success: false,
        error: 'articles array is required',
      };
    }

    let deletedCount = 0;
    for (const article of body.articles) {
      if (article.fakeid && article.aid) {
        deleteArticle(article.fakeid, article.aid);
        deletedCount++;
      }
    }

    return {
      success: true,
      message: `Deleted ${deletedCount} articles`,
      deletedCount,
    };
  } catch (error) {
    console.error('Failed to delete articles:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

/**
 * 数据库同步工具
 * 用于在代理 API 返回数据后，将数据同步到 SQLite 数据库
 */

import { upsertAccount, upsertAccounts } from '~/server/database/models/account';
import { upsertArticle, upsertArticles } from '~/server/database/models/article';
import { linkArticleResources, upsertAsset } from '~/server/database/models/asset';
import { insertCommentReplies, insertComments } from '~/server/database/models/comment';
import { upsertArticleHtml } from '~/server/database/models/html';
import { upsertArticleMetadata } from '~/server/database/models/metadata';

/**
 * 同步公众号信息
 */
export function syncAccount(account: any): void {
  try {
    upsertAccount({
      fakeid: account.fakeid,
      nickname: account.nickname,
      round_head_img: account.round_head_img,
      signature: account.signature,
      service_type: account.service_type,
      completed: account.completed,
      count: account.count,
      articles: account.articles,
      total_count: account.total_count,
      create_time: account.create_time,
      update_time: account.update_time,
      last_update_time: account.last_update_time,
    });
  } catch (error) {
    console.error('Failed to sync account:', error);
  }
}

/**
 * 同步文章列表
 */
export function syncArticles(fakeid: string, articles: any[]): void {
  console.log(`[DB Sync] syncArticles called: fakeid=${fakeid}, articles_count=${articles.length}`);
  try {
    const formattedArticles = articles.map(article => ({
      fakeid,
      aid: article.aid || article.item_idx,
      type: article.type,
      title: article.title,
      digest: article.digest,
      content: article.content,
      cover: article.cover,
      author_name: article.author_name,
      copyright_stat: article.copyright_stat,
      is_original: article.is_original,
      datetime: article.datetime || article.create_time,
      create_time: article.create_time,
      link: article.link,
      item_show_type: article.item_show_type,
      _status: article._status || 'pending',
      _single: article._single,
      content_download: article.content_download || false,
      comment_download: article.comment_download || false,
    }));

    upsertArticles(formattedArticles);
    console.log(`Synced ${formattedArticles.length} articles for account ${fakeid}`);
  } catch (error) {
    console.error('Failed to sync articles:', error);
  }
}

/**
 * 同步单篇文章
 */
export function syncArticle(fakeid: string, article: any): void {
  syncArticles(fakeid, [article]);
}

/**
 * 同步文章 HTML 内容
 */
export function syncArticleHtml(articleId: number, htmlContent: string): void {
  try {
    upsertArticleHtml({
      article_id: articleId,
      html_content: htmlContent,
      file_size: htmlContent.length,
    });
    console.log(`Synced HTML content for article ${articleId}`);
  } catch (error) {
    console.error('Failed to sync article HTML:', error);
  }
}

/**
 * 同步文章元数据
 */
export function syncArticleMetadata(articleId: number, metadata: any): void {
  try {
    upsertArticleMetadata({
      article_id: articleId,
      read_num: metadata.read_num,
      like_num: metadata.like_num,
      comment_num: metadata.comment_num,
      reward_num: metadata.reward_num,
      share_num: metadata.share_num,
      real_read_num: metadata.real_read_num,
      real_like_num: metadata.real_like_num,
      picked_num: metadata.picked_num,
      play_num: metadata.play_num,
    });
    console.log(`Synced metadata for article ${articleId}`);
  } catch (error) {
    console.error('Failed to sync article metadata:', error);
  }
}

/**
 * 同步评论数据
 */
export function syncComments(articleId: number, comments: any[]): void {
  try {
    const formattedComments = comments.map(comment => ({
      article_id: articleId,
      content_id: comment.content_id || comment.id,
      content: comment.content,
      like_num: comment.like_num,
      reply_id: comment.reply_id,
      is_friend: comment.is_friend,
      is_top: comment.is_top,
      create_time: comment.create_time,
      reply_comment_id: comment.reply_comment_id,
    }));

    insertComments(formattedComments);

    // 同步评论回复
    for (const comment of comments) {
      if (comment.reply && comment.reply.length > 0) {
        syncCommentReplies(articleId, comment.content_id, comment.reply);
      }
    }

    console.log(`Synced ${formattedComments.length} comments for article ${articleId}`);
  } catch (error) {
    console.error('Failed to sync comments:', error);
  }
}

/**
 * 同步评论回复
 */
export function syncCommentReplies(articleId: number, commentId: string, replies: any[]): void {
  try {
    // 这里需要先获取评论的内部 ID
    // 简化处理：假设 commentId 可以直接使用
    const formattedReplies = replies.map(reply => ({
      comment_id: parseInt(commentId) || articleId, // 需要实际映射
      content_id: reply.content_id || reply.id,
      content: reply.content,
      like_num: reply.like_num,
      create_time: reply.create_time,
    }));

    insertCommentReplies(formattedReplies);
  } catch (error) {
    console.error('Failed to sync comment replies:', error);
  }
}

/**
 * 同步资源文件
 */
export function syncAssets(fakeid: string, assets: any[]): void {
  try {
    const formattedAssets = assets.map(asset => ({
      url: asset.url,
      fakeid,
      file_path: asset.file_path,
      file_size: asset.file_size,
      mime_type: asset.mime_type,
      width: asset.width,
      height: asset.height,
      duration: asset.duration,
    }));

    upsertAssets(formattedAssets);
    console.log(`Synced ${formattedAssets.length} assets for account ${fakeid}`);
  } catch (error) {
    console.error('Failed to sync assets:', error);
  }
}

/**
 * 同步文章资源关联
 */
export function syncArticleResources(articleId: number, resources: any[]): void {
  try {
    const formattedResources = resources.map(resource => ({
      article_id: articleId,
      asset_url: resource.url,
      resource_type: resource.type || 'image',
    }));

    linkArticleResources(formattedResources);
  } catch (error) {
    console.error('Failed to sync article resources:', error);
  }
}

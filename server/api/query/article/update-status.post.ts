/**
 * 更新文章状态
 * 支持更新：status, deleted, contentDownload, commentDownload, metadataDownload
 */

import {
  getArticleFakeidAidByLink,
  updateArticleCommentDownload,
  updateArticleContentDownload,
  updateArticleDeleted,
  updateArticleMetadataDownload,
  updateArticleStatus,
} from '~/server/database/models/article';

interface UpdateStatusBody {
  link: string;
  status?: string;
  isDeleted?: boolean;
  contentDownload?: boolean;
  commentDownload?: boolean;
  metadataDownload?: boolean;
}

export default defineEventHandler(async event => {
  try {
    const body = (await readBody(event)) as UpdateStatusBody;

    if (!body.link) {
      return {
        success: false,
        error: 'link is required',
      };
    }

    // 根据 link 获取 fakeid 和 aid
    const articleInfo = getArticleFakeidAidByLink(body.link);
    if (!articleInfo) {
      return {
        success: false,
        error: 'Article not found',
      };
    }

    const { fakeid, aid } = articleInfo;

    // 更新状态
    if (body.status !== undefined) {
      updateArticleStatus(fakeid, aid, body.status);
    }

    if (body.isDeleted !== undefined) {
      updateArticleDeleted(fakeid, aid, body.isDeleted);
    }

    if (body.contentDownload !== undefined) {
      updateArticleContentDownload(fakeid, aid, body.contentDownload);
    }

    if (body.commentDownload !== undefined) {
      updateArticleCommentDownload(fakeid, aid, body.commentDownload);
    }

    if (body.metadataDownload !== undefined) {
      updateArticleMetadataDownload(fakeid, aid, body.metadataDownload);
    }

    return {
      success: true,
      message: 'Article status updated successfully',
    };
  } catch (error) {
    console.error('Failed to update article status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

/**
 * 文章数据管理
 * 数据源：后端 SQLite 数据库
 */

import type { AppMsgExWithFakeID, PublishInfo, PublishPage } from '~/types/types';
import { type MpAccount, updateInfoCache } from './info';

export type ArticleAsset = AppMsgExWithFakeID;

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface UpdateStatusResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * 更新文章缓存（由后端自动处理）
 * @param account
 * @param publish_page
 * @deprecated 数据由后端自动同步
 */
export async function updateArticleCache(_account: MpAccount, _publish_page: PublishPage) {
  // 数据由后端 API 自动同步，这里保留空实现以保持兼容性
  // 后端在 /api/web/mp/appmsgpublish 中自动写入数据库
}

/**
 * 检查是否存在指定时间之前的缓存
 * @param fakeid 公众号id
 * @param create_time 创建时间
 * @deprecated 从后端查询，不再使用缓存检查
 */
export async function hitCache(fakeid: string, create_time: number): Promise<boolean> {
  try {
    const response = await $fetch<ApiResponse<any[]>>(`/api/query/articles?fakeid=${fakeid}&limit=1`);
    if (response?.success && response.pagination) {
      return response.pagination.total > 0;
    }
    return false;
  } catch (error) {
    console.error('Failed to check cache:', error);
    return false;
  }
}

/**
 * 从后端获取文章列表
 * @param fakeid 公众号id
 * @param create_time 创建时间
 */
export async function getArticleCache(fakeid: string, create_time: number): Promise<AppMsgExWithFakeID[]> {
  try {
    const response = await $fetch<ApiResponse<any[]>>(
      `/api/query/articles?fakeid=${fakeid}&limit=10000&sortBy=datetime&sortOrder=desc`
    );
    if (response?.success && response.data) {
      // 过滤出指定时间之前的文章
      return response.data.filter(article => article.create_time < create_time);
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch articles from backend:', error);
    return [];
  }
}

/**
 * 根据 url 获取文章对象
 * @param url
 */
export async function getArticleByLink(url: string): Promise<AppMsgExWithFakeID> {
  try {
    // 使用新的 API 端点根据 link 查询文章
    const response = await $fetch<ApiResponse<any>>(`/api/query/article/by-link?link=${encodeURIComponent(url)}`);
    if (response?.success && response.data) {
      return response.data;
    }
    throw new Error(`Article(${url}) does not exist`);
  } catch (error) {
    console.error('Failed to fetch article by link:', error);
    throw new Error(`Article(${url}) does not exist`);
  }
}

/**
 * 根据 url 获取单篇文章对象
 * @param url
 */
export async function getSingleArticleByLink(url: string): Promise<AppMsgExWithFakeID> {
  // 使用与 getArticleByLink 相同的 API 端点
  // 单篇文章也会通过 link 查询到
  try {
    const response = await $fetch<ApiResponse<any>>(`/api/query/article/by-link?link=${encodeURIComponent(url)}`);
    if (response?.success && response.data) {
      return response.data;
    }
    throw new Error(`Article(${url}) does not exist`);
  } catch (error) {
    console.error('Failed to fetch single article by link:', error);
    throw new Error(`Article(${url}) does not exist`);
  }
}

/**
 * 文章删除状态更新
 * @param url
 * @param is_deleted
 */
export async function articleDeleted(url: string, is_deleted = true): Promise<void> {
  try {
    const response = await $fetch<UpdateStatusResponse>('/api/query/article/update-status', {
      method: 'POST',
      body: {
        link: url,
        isDeleted: is_deleted,
        status: is_deleted ? '已删除' : undefined,
      },
    });
    if (!response?.success) {
      console.error('Failed to update article deleted status:', response?.error);
    }
  } catch (error) {
    console.error('Failed to update article deleted status:', error);
  }
}

/**
 * 更新文章状态
 * @param url
 * @param status
 */
export async function updateArticleStatus(url: string, status: string): Promise<void> {
  try {
    const response = await $fetch<UpdateStatusResponse>('/api/query/article/update-status', {
      method: 'POST',
      body: {
        link: url,
        status: status,
      },
    });
    if (!response?.success) {
      console.error('Failed to update article status:', response?.error);
    }
  } catch (error) {
    console.error('Failed to update article status:', error);
  }
}

/**
 * 更新文章的 fakeid
 * @param url
 * @param fakeid
 * @deprecated 暂不支持，需要修改数据库表结构
 */
export async function updateArticleFakeid(url: string, fakeid: string): Promise<void> {
  console.warn('updateArticleFakeid: not supported yet', url, fakeid);
}

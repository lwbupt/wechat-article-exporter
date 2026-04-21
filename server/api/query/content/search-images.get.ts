/**
 * 搜索图片 API
 * 通过统一 Provider 接口按 source 参数路由到对应配图方式
 */

import { getImageProvider, type ImageResult } from '~/server/utils/image-providers';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const keyword = query.query as string;
  const source = (query.source as string) || '';
  const page = Number(query.page) || 1;
  const perPage = Number(query.perPage) || 12;

  if (!keyword) {
    return { success: false, error: '请输入搜索关键词' };
  }

  const provider = getImageProvider(source || 'free_search');

  try {
    const images = await provider.search(keyword, perPage);

    if (images.length === 0) {
      return { success: true, images: [], total: 0 };
    }

    return { success: true, images, total: images.length };
  } catch (err) {
    console.error(`[ImageSearch] ${provider.label} failed:`, err);
    return {
      success: false,
      error: `${provider.label}搜索失败：${err instanceof Error ? err.message : '未知错误'}`,
      images: [],
      total: 0,
    };
  }
});

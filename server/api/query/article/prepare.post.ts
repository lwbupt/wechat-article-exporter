/**
 * 准备单篇文章：解析 URL、长链接转短链接、保存到数据库
 * 前端只需调用此接口，后端一次性完成所有准备工作
 */

import { upsertArticle } from '~/server/database/models/article';
import { getTokenFromStore } from '~/server/utils/CookieStore';
import { proxyMpRequest } from '~/server/utils/proxy-request';

interface PublishPage {
  publish_list: any[];
  total_count: number;
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { url } = body;

    if (!url) {
      return { success: false, error: 'Missing required field: url' };
    }

    // 规范化 URL
    let normalizedUrl = url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const parsed = new URL(normalizedUrl);
    if (parsed.hostname !== 'mp.weixin.qq.com') {
      return { success: false, error: '请输入有效的公众号文章链接!' };
    }

    // 解析 URL 参数
    const fakeid = parsed.searchParams.get('__biz') || '';
    const mid = parsed.searchParams.get('mid') || '';
    const idx = Number(parsed.searchParams.get('idx')) || 1;
    const isLongUrl = parsed.pathname === '/s' && fakeid && mid;

    // 文章元数据（默认值）
    let articleLink = normalizedUrl;
    let articleFakeid = fakeid || 'SINGLE_ARTICLE_FAKEID';
    let articleAid = '';
    let articleTitle = '未命名文章';
    let articleAuthor = '--';
    let articleDigest = '';
    let articleCover = '';
    let articleCreateTime = Math.floor(Date.now() / 1000);
    let articleUpdateTime = Math.floor(Date.now() / 1000);

    // 短链接：从 path 提取 aid
    if (!isLongUrl) {
      const pathParts = parsed.pathname.split('/');
      articleAid = pathParts[pathParts.length - 1] || parsed.pathname;
    } else {
      // 长链接：mid_idx 作为临时 aid
      articleAid = `${Number(mid)}_${idx}`;
    }

    // 长链接 → 尝试转换为短链接
    if (isLongUrl) {
      const resolved = await resolveLongUrl(event, fakeid, Number(mid));
      if (resolved) {
        articleLink = resolved.link;
        articleAid = resolved.aid || articleAid;
        articleTitle = resolved.title || articleTitle;
        articleAuthor = resolved.author_name || articleAuthor;
        articleDigest = resolved.digest || articleDigest;
        articleCover = resolved.cover || articleCover;
        articleCreateTime = resolved.create_time || articleCreateTime;
        articleUpdateTime = resolved.update_time || articleUpdateTime;
      } else {
        return {
          success: false,
          error: '长链接转换短链接失败，无法处理此文章',
        };
      }
    }

    // 保存文章到数据库
    upsertArticle({
      fakeid: articleFakeid,
      aid: articleAid,
      type: 0,
      title: articleTitle,
      digest: articleDigest,
      cover: articleCover || undefined,
      author_name: articleAuthor,
      datetime: articleUpdateTime || articleCreateTime,
      create_time: articleCreateTime,
      link: articleLink,
      itemidx: idx,
      _status: '',
      _single: true,
      is_hot: true,
      content_download: false,
      comment_download: false,
    });

    return {
      success: true,
      data: {
        id: `${articleFakeid}:${articleAid}`,
        fakeid: articleFakeid,
        aid: articleAid,
        link: articleLink,
        title: articleTitle,
        author_name: articleAuthor,
        digest: articleDigest,
        cover: articleCover,
        create_time: articleCreateTime,
        update_time: articleUpdateTime,
        itemidx: idx,
        is_long_url: isLongUrl,
      },
    };
  } catch (error) {
    console.error('Failed to prepare article:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

/**
 * 通过公众号文章列表 API 将长链接转换为短链接
 */
async function resolveLongUrl(
  event: any,
  fakeid: string,
  targetAppmsgid: number
): Promise<{
  link: string;
  title: string;
  aid?: string;
  cover?: string;
  author_name?: string;
  digest?: string;
  create_time?: number;
  update_time?: number;
} | null> {
  const token = await getTokenFromStore(event);
  if (!token) return null;

  const pageSize = 5;
  let begin = 0;
  const maxPages = 50;

  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, string | number> = {
      sub: 'list',
      search_field: 'null',
      begin,
      count: pageSize,
      query: '',
      fakeid,
      type: '101_1',
      free_publish_type: 1,
      sub_action: 'list_ex',
      token,
      lang: 'zh_CN',
      f: 'json',
      ajax: 1,
    };

    const response = await proxyMpRequest({
      event,
      method: 'GET',
      endpoint: 'https://mp.weixin.qq.com/cgi-bin/appmsgpublish',
      query: params,
      parseJson: true,
    });

    if (!response || response.base_resp?.ret !== 0) return null;

    const publishPage: PublishPage = JSON.parse(response.publish_page);
    const publishList = publishPage.publish_list || [];
    if (publishList.length === 0) return null;

    for (const item of publishList) {
      if (!item.publish_info) continue;
      const publishInfo = JSON.parse(item.publish_info);
      const articles = publishInfo.appmsgex || [];

      for (const article of articles) {
        if (article.appmsgid === targetAppmsgid) {
          return {
            link: article.link,
            title: article.title,
            aid: article.aid,
            cover: article.cover,
            author_name: article.author_name,
            digest: article.digest,
            create_time: article.create_time,
            update_time: article.update_time,
          };
        }
      }
    }

    begin += pageSize;
  }

  return null;
}

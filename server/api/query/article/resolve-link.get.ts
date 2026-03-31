/**
 * 将长格式文章链接转换为短链接
 * 通过 fakeid（__biz）调微信 API 获取文章列表，匹配 appmsgid（mid）找到短链接
 */

import { getTokenFromStore } from '~/server/utils/CookieStore';
import { proxyMpRequest } from '~/server/utils/proxy-request';

interface PublishPage {
  publish_list: any[];
  total_count: number;
}

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const fakeid = query.fakeid as string;
    const appmsgid = query.appmsgid as string;

    if (!fakeid || !appmsgid) {
      return {
        success: false,
        error: 'Missing required fields: fakeid, appmsgid',
      };
    }

    const targetAppmsgid = Number(appmsgid);
    const token = await getTokenFromStore(event);
    if (!token) {
      return {
        success: false,
        error: '未登录或登录已过期，请重新扫码登录',
      };
    }

    // 分页遍历文章列表，查找匹配的文章
    const pageSize = 5;
    let begin = 0;
    const maxPages = 50; // 最多查 50 页，避免无限循环

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

      if (!response || response.base_resp?.ret !== 0) {
        return {
          success: false,
          error: `微信 API 返回错误: ${response?.base_resp?.err_msg || 'unknown'}`,
        };
      }

      const publishPage: PublishPage = JSON.parse(response.publish_page);
      const publishList = publishPage.publish_list || [];

      if (publishList.length === 0) {
        break; // 没有更多文章了
      }

      // 遍历每篇文章，匹配 appmsgid
      for (const item of publishList) {
        if (!item.publish_info) continue;
        const publishInfo = JSON.parse(item.publish_info);
        const articles = publishInfo.appmsgex || [];

        for (const article of articles) {
          if (article.appmsgid === targetAppmsgid) {
            return {
              success: true,
              data: {
                link: article.link,
                title: article.title,
                aid: article.aid,
                cover: article.cover,
                author_name: article.author_name,
                digest: article.digest,
                create_time: article.create_time,
                update_time: article.update_time,
              },
            };
          }
        }
      }

      begin += pageSize;
    }

    return {
      success: false,
      error: `未在公众号 ${fakeid} 的文章列表中找到 appmsgid=${appmsgid} 的文章`,
    };
  } catch (error) {
    console.error('Failed to resolve article link:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

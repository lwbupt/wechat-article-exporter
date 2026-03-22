/**
 * 获取文章列表接口
 */

import { getTokenFromStore } from '~/server/utils/CookieStore';
import { syncArticles } from '~/server/utils/db-sync';
import { proxyMpRequest } from '~/server/utils/proxy-request';

interface AppMsgPublishQuery {
  begin?: number;
  size?: number;
  id: string;
  keyword: string;
}

export default defineEventHandler(async event => {
  const token = await getTokenFromStore(event);
  if (!token) {
    return { base_resp: { ret: -1, err_msg: '未登录或登录已过期，请重新扫码登录' } };
  }

  const query = getQuery<AppMsgPublishQuery>(event);
  const id = query.id;
  const keyword = query.keyword;
  const begin: number = query.begin || 0;
  const size: number = query.size || 5;

  const isSearching = !!keyword;

  const params: Record<string, string | number> = {
    sub: isSearching ? 'search' : 'list',
    search_field: isSearching ? '7' : 'null',
    begin: begin,
    count: size,
    query: keyword,
    fakeid: id,
    type: '101_1',
    free_publish_type: 1,
    sub_action: 'list_ex',
    token: token,
    lang: 'zh_CN',
    f: 'json',
    ajax: 1,
  };

  const response = await proxyMpRequest({
    event: event,
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/appmsgpublish',
    query: params,
    parseJson: true,
  }).catch(e => {
    console.error(e);
    return {
      base_resp: {
        ret: -1,
        err_msg: '获取文章列表接口失败，请重试',
      },
    };
  });

  console.log(`[API] /api/web/mp/appmsgpublish response:`, {
    fakeid: id,
    has_response: !!response,
    has_publish_page: !!response?.publish_page,
    ret: response?.base_resp?.ret,
  });

  // 同步文章数据到数据库
  // 微信返回的数据在 publish_page 字段中（JSON 字符串）
  if (response && response.publish_page && response.base_resp?.ret === 0) {
    try {
      const publishPage = JSON.parse(response.publish_page);
      const publishList = publishPage.publish_list || [];

      // 提取所有文章
      const articles = publishList
        .filter(item => !!item.publish_info)
        .flatMap(item => {
          const publishInfo = JSON.parse(item.publish_info);
          return publishInfo.appmsgex || [];
        });

      console.log(`[API] Syncing articles to database: count=${articles.length}`);

      if (articles.length > 0) {
        syncArticles(id, articles);
      }
    } catch (error) {
      console.error('Failed to sync articles to database:', error);
    }
  }

  return response;
});

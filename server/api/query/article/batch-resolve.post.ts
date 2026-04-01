/**
 * 批量转换长链接为短链接
 * 按 fakeid 分组，每组只遍历一次微信 API，批量匹配 appmsgid
 * 逐条返回结果供前端更新进度
 */

import { upsertArticle } from '~/server/database/models/article';
import db from '~/server/database/index';
import { getTokenFromStore } from '~/server/utils/CookieStore';
import { proxyMpRequest } from '~/server/utils/proxy-request';

interface PublishPage {
  publish_list: any[];
  total_count: number;
}

interface ResolveItem {
  fakeid: string;
  aid: string;
  link: string;
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const articles: ResolveItem[] = body.articles;

    if (!articles || !articles.length) {
      return { success: false, error: 'No articles provided' };
    }

    const token = await getTokenFromStore(event);
    if (!token) {
      return { success: false, error: '未登录或登录已过期，请重新扫码登录' };
    }

    // 按 fakeid 分组
    const grouped = new Map<string, ResolveItem[]>();
    for (const art of articles) {
      const group = grouped.get(art.fakeid) || [];
      group.push(art);
      grouped.set(art.fakeid, group);
    }

    let resolved = 0;
    let failed = 0;
    const details: { title: string; status: string; shortLink?: string; reason?: string }[] = [];

    // 获取 stmt 用于更新
    const updateStmt = db.prepare(
      'UPDATE articles SET link = ?, title = COALESCE(?, title), author_name = COALESCE(?, author_name), digest = COALESCE(?, digest), cover = COALESCE(?, cover), datetime = COALESCE(?, datetime), create_time = COALESCE(?, create_time) WHERE fakeid = ? AND aid = ?'
    );

    for (const [fakeid, items] of grouped) {
      // 收集该组所有需要匹配的 appmsgid
      const targetMap = new Map<number, ResolveItem>();
      for (const item of items) {
        const url = new URL(item.link);
        const mid = Number(url.searchParams.get('mid'));
        if (mid) targetMap.set(mid, item);
      }

      if (targetMap.size === 0) {
        for (const item of items) {
          failed++;
          details.push({ title: '', status: 'failed', reason: 'URL 中缺少 mid 参数' });
        }
        continue;
      }

      // 遍历该公众号的文章列表
      const pageSize = 5;
      let begin = 0;
      const maxPages = 100;
      const matched = new Set<number>();

      for (let page = 0; page < maxPages && matched.size < targetMap.size; page++) {
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

        let response: any;
        try {
          response = await proxyMpRequest({
            event,
            method: 'GET',
            endpoint: 'https://mp.weixin.qq.com/cgi-bin/appmsgpublish',
            query: params,
            parseJson: true,
          });
        } catch {
          break;
        }

        if (!response || response.base_resp?.ret !== 0) break;

        const publishPage: PublishPage = JSON.parse(response.publish_page);
        const publishList = publishPage.publish_list || [];
        if (publishList.length === 0) break;

        for (const pubItem of publishList) {
          if (!pubItem.publish_info) continue;
          const publishInfo = JSON.parse(pubItem.publish_info);
          const waArticles = publishInfo.appmsgex || [];

          for (const wa of waArticles) {
            const targetItem = targetMap.get(wa.appmsgid);
            if (targetItem && !matched.has(wa.appmsgid)) {
              matched.add(wa.appmsgid);

              // 更新数据库：短链接 + 元数据
              updateStmt.run(
                wa.link,
                wa.title || null,
                wa.author_name || null,
                wa.digest || null,
                wa.cover || null,
                wa.update_time || wa.create_time || null,
                wa.create_time || null,
                targetItem.fakeid,
                targetItem.aid
              );

              resolved++;
              details.push({
                title: wa.title || targetItem.aid,
                status: 'resolved',
                shortLink: wa.link,
              });
            }
          }
        }

        begin += pageSize;
      }

      // 未匹配到的标记为失败
      for (const [appmsgid, item] of targetMap) {
        if (!matched.has(appmsgid)) {
          failed++;
          details.push({
            title: item.aid,
            status: 'failed',
            reason: `在公众号文章列表中未找到 mid=${appmsgid}`,
          });
        }
      }
    }

    return {
      success: true,
      data: { total: articles.length, resolved, failed, details },
    };
  } catch (error) {
    console.error('Failed to batch resolve:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

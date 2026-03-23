/**
 * 后端下载文章HTML内容
 */

import { PUBLIC_PROXY_LIST } from '~/config/public-proxy';
import { getArticleByLink as getArticleFromDB } from '~/server/database/models/article';
import { upsertArticleHtml } from '~/server/database/models/html';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { url } = body;

    if (!url) {
      return {
        success: false,
        error: 'url is required',
      };
    }

    const diagnostics: Record<string, any> = {
      url,
      timestamp: new Date().toISOString(),
    };

    // 步骤1: 从数据库获取文章信息
    const article = getArticleFromDB(url);
    if (!article) {
      return {
        success: false,
        error: 'Article not found in database',
        diagnostics,
      };
    }

    diagnostics.articleFound = true;
    diagnostics.fakeid = article.fakeid;

    // 步骤2: 尝试下载HTML内容
    const proxyList = PUBLIC_PROXY_LIST;
    let lastError: Error | null = null;

    // 尝试多个代理
    for (let i = 0; i < Math.min(5, proxyList.length); i++) {
      const proxy = proxyList[i];
      const proxyUrl = `${proxy}?url=${encodeURIComponent(url)}`;

      try {
        // 使用 Node.js 的 fetch（需要 polyfill 或使用 https 模块）
        // 这里使用全局的 fetch（Node 18+）
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

        const response = await fetch(proxyUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();

        // 检查内容是否有效
        if (html.includes('rich_media_title') || html.includes('var msg_title =') || html.includes('cgiData')) {
          // 保存HTML内容到数据库
          upsertArticleHtml({
            article_id: article.id,
            html_content: html,
            file_size: html.length,
            is_valid: true,
          });

          return {
            success: true,
            message: 'Download successful',
            diagnostics: {
              ...diagnostics,
              proxy,
              contentLength: html.length,
              hasValidContent: true,
            },
          };
        } else {
          // 内容无效，可能是反爬虫页面
          diagnostics.htmlPreview = html.substring(0, 500);
          throw new Error('Invalid content - possible anti-crawler page');
        }
      } catch (error) {
        lastError = error as Error;
        diagnostics[`proxy_${i}_error`] = error.message;
        continue; // 尝试下一个代理
      }
    }

    // 所有代理都失败了
    return {
      success: false,
      error: lastError?.message || 'All proxies failed',
      diagnostics,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

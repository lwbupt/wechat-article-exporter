/**
 * 测试代理连接
 */

import { PUBLIC_PROXY_LIST } from '~/config/public-proxy';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const proxyIndex = Number(query.proxyIndex || 0);

  const results: any[] = [];

  // 测试前 5 个代理
  const proxiesToTest = PUBLIC_PROXY_LIST.slice(0, 5);

  for (let i = 0; i < proxiesToTest.length; i++) {
    const proxy = proxiesToTest[i];
    const testUrl = `${proxy}?url=${encodeURIComponent('https://mp.weixin.qq.com')}`;

    const result: any = {
      index: i,
      proxy,
      status: 'testing',
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

      const response = await fetch(testUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      }).catch(err => {
        throw err;
      });

      clearTimeout(timeoutId);

      result.status = response.ok ? 'success' : 'failed';
      result.httpStatus = response.status;
      result.statusText = response.statusText;

      // 获取部分响应内容
      const text = await response.text();
      result.contentLength = text.length;
      result.contentPreview = text.substring(0, 200);
    } catch (error: any) {
      result.status = 'error';
      result.error = error.message;
      result.errorType = error.name;
    }

    results.push(result);
  }

  return {
    success: true,
    totalTested: results.length,
    working: results.filter(r => r.status === 'success').length,
    results,
  };
});

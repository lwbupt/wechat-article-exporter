/**
 * 测试文章下载
 * 用于诊断单篇文章下载失败的问题
 */

import { PUBLIC_PROXY_LIST } from '~/config/public-proxy';
import db from '~/server/database/index';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const url = query.url as string;

  if (!url) {
    return {
      success: false,
      error: 'url parameter is required',
      diagnostics: null,
    };
  }

  const diagnostics: Record<string, any> = {
    url,
    timestamp: new Date().toISOString(),
    steps: [],
  };

  try {
    // 步骤 1: 检查数据库中是否存在该文章
    diagnostics.steps.push({ step: 1, action: '检查数据库中的文章' });

    const articleStmt = db.prepare('SELECT * FROM articles WHERE link = ?');
    const article = articleStmt.get(url) as any | undefined;

    if (article) {
      diagnostics.steps.push({ step: 1, status: 'success', message: '文章存在于数据库', article });
    } else {
      diagnostics.steps.push({ step: 1, status: 'failed', message: '文章不存在于数据库' });
    }

    // 步骤 2: 尝试下载文章内容
    diagnostics.steps.push({ step: 2, action: '尝试下载文章内容' });

    // 使用公共代理列表
    const proxyList = PUBLIC_PROXY_LIST;
    const proxy = proxyList[0]; // 使用第一个公共代理

    diagnostics.steps.push({ step: 2, status: 'info', message: '使用公共代理', proxy, totalProxies: proxyList.length });

    // 构建代理 URL
    const proxyUrl = `${proxy}?url=${encodeURIComponent(url)}`;

    diagnostics.steps.push({ step: 2, status: 'info', message: '使用代理', proxyUrl });

    // 尝试下载
    const response = await fetch(proxyUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    diagnostics.steps.push({
      step: 2,
      status: 'info',
      message: '响应状态',
      status: response.status,
      statusText: response.statusText,
    });

    if (!response.ok) {
      diagnostics.steps.push({ step: 2, status: 'failed', message: '下载失败', status: response.status });
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        diagnostics,
      };
    }

    // 获取响应内容
    const html = await response.text();
    diagnostics.steps.push({ step: 2, status: 'success', message: '下载成功', contentLength: html.length });

    // 保存前 500 个字符用于调试
    diagnostics.htmlPreview = html.substring(0, 500);
    diagnostics.fullHtml = html; // 完整内容，用于分析

    // 步骤 3: 检查内容是否有效
    diagnostics.steps.push({ step: 3, action: '检查内容有效性' });

    // 检查是否有微信文章的特征
    const hasWechatClass = html.includes('rich_media_title');
    const hasJsContent = html.includes('var msg_title =');
    const hasCgiData = html.includes('cgiData');

    diagnostics.steps.push({
      step: 3,
      status: 'info',
      message: '内容特征检查',
      hasWechatClass,
      hasJsContent,
      hasCgiData,
    });

    // 检查是否被重定向或反爬虫
    if (html.includes('请点击此处') || html.includes('重定向') || html.includes('验证')) {
      diagnostics.steps.push({ step: 3, status: 'warning', message: '可能遇到反爬虫机制' });
    }

    // 步骤 4: 尝试解析文章标题
    diagnostics.steps.push({ step: 4, action: '解析文章标题' });

    let title = '未找到标题';

    // 尝试从 meta 标签获取标题
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    if (titleMatch) {
      title = titleMatch[1];
      diagnostics.steps.push({ step: 4, status: 'success', message: '从 meta 标签获取标题', title });
    } else {
      // 尝试从 js 变量获取标题
      const jsTitleMatch = html.match(/var msg_title\s*=\s*"([^"]+)"/);
      if (jsTitleMatch) {
        title = jsTitleMatch[1];
        diagnostics.steps.push({ step: 4, status: 'success', message: '从 js 变量获取标题', title });
      } else {
        diagnostics.steps.push({ step: 4, status: 'failed', message: '无法解析标题' });
      }
    }

    // 步骤 5: 检查是否需要更新数据库
    if (!article && title !== '未找到标题') {
      diagnostics.steps.push({ step: 5, action: '文章不存在，建议添加到数据库' });

      // 从 URL 解析参数
      const parsedUrl = new URL(url);
      const fakeid = parsedUrl.searchParams.get('__biz') || 'SINGLE_ARTICLE_FAKEID';
      const mid = parsedUrl.searchParams.get('mid') || parsedUrl.searchParams.get('appmsgid');
      const idx = parsedUrl.searchParams.get('idx') || parsedUrl.searchParams.get('itemidx') || '1';

      let aid: string;
      if (mid) {
        aid = `${mid}_${idx}`;
      } else {
        // 使用 URL path 的最后一部分作为 aid
        const pathParts = parsedUrl.pathname.split('/');
        aid = pathParts[pathParts.length - 1] || parsedUrl.pathname;
      }

      diagnostics.steps.push({
        step: 5,
        status: 'info',
        message: '建议的文章参数',
        fakeid,
        aid,
        title,
      });
    }

    return {
      success: true,
      message: '测试完成',
      diagnostics,
    };
  } catch (error) {
    diagnostics.steps.push({ step: 'error', status: 'error', message: '测试失败', error: String(error) });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      diagnostics,
    };
  }
});

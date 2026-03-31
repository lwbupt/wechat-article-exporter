export interface HtmlAsset {
  fakeid: string;
  url: string;
  file: Blob;
  title: string;
  commentID: string | null;
}

/**
 * 保存 HTML 内容到后端 SQLite
 * @param html 缓存对象
 */
export async function updateHtmlCache(html: HtmlAsset): Promise<boolean> {
  try {
    const htmlString = await html.file.text();
    await $fetch('/api/query/article/html/save', {
      method: 'POST',
      body: {
        url: html.url,
        html: htmlString,
      },
    });
    return true;
  } catch (error) {
    console.error('Failed to save HTML to backend:', error);
    return false;
  }
}

/**
 * 从后端 SQLite 获取 HTML 内容
 * @param url 文章链接
 */
export async function getHtmlCache(url: string): Promise<HtmlAsset | undefined> {
  try {
    const response = await $fetch<{
      success: boolean;
      data?: { html: string; file_size: number; download_time: number };
      error?: string;
    }>('/api/query/article/html/by-url', {
      query: { url },
    });

    if (response?.success && response.data?.html) {
      return {
        fakeid: '',
        url,
        file: new Blob([response.data.html], { type: 'text/html' }),
        title: '',
        commentID: null,
      };
    }
    return undefined;
  } catch (error) {
    console.error('Failed to get HTML from backend:', error);
    return undefined;
  }
}

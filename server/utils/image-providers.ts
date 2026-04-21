/**
 * 图片配图统一 Provider 接口
 * 3 种配图方式：免费搜索(Pexels) / 付费搜索(Serper.dev) / AI生图(预留)
 * 新增配图方式只需实现 ImageProvider 接口并注册到工厂函数
 */

import db from '~/server/database/index';

// ========== 统一接口 ==========

export interface ImageResult {
  id: string;
  url: string;
  thumbnail: string;
  width: number;
  height: number;
  alt: string;
  source: string;
}

export interface ImageProvider {
  readonly name: string;
  readonly label: string;
  search(keyword: string, count: number): Promise<ImageResult[]>;
}

// ========== 免费搜索：Pexels ==========

class FreeSearchProvider implements ImageProvider {
  readonly name = 'free_search';
  readonly label = '免费搜索 (Pexels)';

  async search(keyword: string, count: number): Promise<ImageResult[]> {
    const apiKey = getSetting('pexels_api_key') || process.env.PEXELS_API_KEY || '';
    if (!apiKey) {
      console.warn('[ImageProvider:FreeSearch] No Pexels API key configured');
      return [];
    }

    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=${count}&orientation=landscape&size=large`;
    const response = await fetch(url, { headers: { Authorization: apiKey } });

    if (!response.ok) {
      throw new Error(`Pexels API error (${response.status})`);
    }

    const data = (await response.json()) as {
      photos?: {
        id: number;
        urls?: { raw?: string; regular?: string; small?: string };
        width: number;
        height: number;
        alt?: string;
      }[];
    };

    if (!data.photos) return [];

    return data.photos.map(img => ({
      id: `pexels-${img.id}`,
      url: img.urls?.raw ? `${img.urls.raw}&w=1920&q=85` : img.urls?.regular || '',
      thumbnail: img.urls?.small || '',
      width: img.width,
      height: img.height,
      alt: img.alt || keyword,
      source: 'pexels',
    }));
  }
}

// ========== 付费搜索：Serper.dev (Google Images) ==========

class PaidSearchProvider implements ImageProvider {
  readonly name = 'paid_search';
  readonly label = '付费搜索 (Serper)';

  async search(keyword: string, count: number): Promise<ImageResult[]> {
    const apiKey = getSetting('serper_api_key') || process.env.SERPER_API_KEY || '';
    if (!apiKey) {
      console.warn('[ImageProvider:PaidSearch] No Serper API key configured');
      return [];
    }

    const response = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify({ q: keyword, num: Math.min(count, 20), gl: 'cn', hl: 'zh-cn' }),
    });

    if (!response.ok) {
      throw new Error(`Serper API error (${response.status})`);
    }

    const data = (await response.json()) as {
      images?: {
        title: string;
        imageUrl: string;
        thumbnailUrl?: string;
        imageWidth?: number;
        imageHeight?: number;
      }[];
    };

    if (!data.images) return [];

    return data.images
      .filter(img => img.imageUrl)
      .map((img, i) => ({
        id: `serper-${i}-${Date.now()}`,
        url: img.imageUrl,
        thumbnail: img.thumbnailUrl || img.imageUrl,
        width: img.imageWidth || 0,
        height: img.imageHeight || 0,
        alt: img.title || keyword,
        source: 'serper',
      }));
  }
}

// ========== AI 生图：预留占位 ==========

class AiGenerateProvider implements ImageProvider {
  readonly name = 'ai_generate';
  readonly label = 'AI 生图';

  async search(_keyword: string, _count: number): Promise<ImageResult[]> {
    console.warn('[ImageProvider:AiGenerate] AI image generation not implemented yet');
    return [];
  }
}

// ========== 工厂函数 ==========

const providers: Record<string, ImageProvider> = {
  free_search: new FreeSearchProvider(),
  paid_search: new PaidSearchProvider(),
  ai_generate: new AiGenerateProvider(),
  // 兼容旧值
  pexels: new FreeSearchProvider(),
  serper: new PaidSearchProvider(),
};

export function getImageProvider(source: string): ImageProvider {
  return providers[source] || providers['free_search'];
}

/** 获取所有可用 Provider 列表（供前端展示） */
export function getAvailableProviders(): { name: string; label: string }[] {
  return [
    { name: 'free_search', label: '免费搜索 (Pexels)' },
    { name: 'paid_search', label: '付费搜索 (Serper)' },
    { name: 'ai_generate', label: 'AI 生图' },
  ];
}

// ========== 工具函数 ==========

function getSetting(key: string): string {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value || '';
  } catch {
    return '';
  }
}

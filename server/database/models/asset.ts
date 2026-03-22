/**
 * 资源数据模型 (图片、视频等)
 */

import db from '../index';

export interface Asset {
  url: string;
  fakeid: string;
  file_path?: string;
  file_size?: number;
  mime_type?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface ArticleResource {
  article_id: number;
  asset_url: string;
  resource_type?: string;
}

/**
 * 插入或更新资源
 */
export function upsertAsset(asset: Asset): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO assets (
      url, fakeid, file_path, file_size, mime_type, width, height, duration
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    asset.url,
    asset.fakeid,
    asset.file_path || null,
    asset.file_size || 0,
    asset.mime_type || null,
    asset.width || 0,
    asset.height || 0,
    asset.duration || 0
  );
}

/**
 * 批量插入或更新资源
 */
export function upsertAssets(assets: Asset[]): void {
  const insert = db.transaction((items: Asset[]) => {
    for (const asset of items) {
      upsertAsset(asset);
    }
  });
  insert(assets);
}

/**
 * 根据 URL 获取资源
 */
export function getAssetByUrl(url: string): any | null {
  const stmt = db.prepare('SELECT * FROM assets WHERE url = ?');
  const result = stmt.get(url) as any;
  return result || null;
}

/**
 * 根据 fakeid 获取资源列表
 */
export function getAssetsByFakeid(fakeid: string): any[] {
  const stmt = db.prepare('SELECT * FROM assets WHERE fakeid = ? ORDER BY created_at DESC');
  return stmt.all(fakeid);
}

/**
 * 关联文章和资源
 */
export function linkArticleResource(articleResource: ArticleResource): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO article_resources (article_id, asset_url, resource_type)
    VALUES (?, ?, ?)
  `);

  stmt.run(articleResource.article_id, articleResource.asset_url, articleResource.resource_type || 'image');
}

/**
 * 批量关联文章和资源
 */
export function linkArticleResources(articleResources: ArticleResource[]): void {
  const insert = db.transaction((items: ArticleResource[]) => {
    for (const item of items) {
      linkArticleResource(item);
    }
  });
  insert(articleResources);
}

/**
 * 获取文章的所有资源
 */
export function getResourcesByArticleId(articleId: number): any[] {
  const stmt = db.prepare(`
    SELECT a.*, ar.resource_type
    FROM assets a
    INNER JOIN article_resources ar ON a.url = ar.asset_url
    WHERE ar.article_id = ?
    ORDER BY a.created_at DESC
  `);
  return stmt.all(articleId);
}

/**
 * 删除资源
 */
export function deleteAsset(url: string): void {
  const stmt = db.prepare('DELETE FROM assets WHERE url = ?');
  stmt.run(url);
}

/**
 * 删除公众号的所有资源
 */
export function deleteAssetsByFakeid(fakeid: string): void {
  const stmt = db.prepare('DELETE FROM assets WHERE fakeid = ?');
  stmt.run(fakeid);
}

/**
 * 删除文章的资源关联
 */
export function deleteArticleResources(articleId: number): void {
  const stmt = db.prepare('DELETE FROM article_resources WHERE article_id = ?');
  stmt.run(articleId);
}

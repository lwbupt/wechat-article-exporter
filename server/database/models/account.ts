/**
 * 公众号数据模型
 */

import db from '../index';

export interface MpAccount {
  fakeid: string;
  nickname?: string;
  round_head_img?: string;
  signature?: string;
  service_type?: number;
  completed?: boolean;
  count?: number;
  articles?: number;
  total_count?: number;
  create_time?: number;
  update_time?: number;
  last_update_time?: number;
}

/**
 * 插入或更新公众号信息
 */
export function upsertAccount(account: MpAccount): void {
  const stmt = db.prepare(`
    INSERT INTO mp_accounts (
      fakeid, nickname, round_head_img, signature, service_type,
      completed, count, articles, total_count,
      create_time, update_time, last_update_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fakeid) DO UPDATE SET
      nickname = excluded.nickname,
      round_head_img = excluded.round_head_img,
      signature = excluded.signature,
      service_type = excluded.service_type,
      completed = excluded.completed,
      count = excluded.count,
      articles = excluded.articles,
      total_count = excluded.total_count,
      update_time = excluded.update_time,
      last_update_time = excluded.last_update_time
  `);

  stmt.run(
    account.fakeid,
    account.nickname || null,
    account.round_head_img || null,
    account.signature || null,
    account.service_type || 0,
    account.completed ? 1 : 0,
    account.count || 0,
    account.articles || 0,
    account.total_count || 0,
    account.create_time || null,
    account.update_time || null,
    account.last_update_time || null
  );
}

/**
 * 批量插入或更新公众号信息
 */
export function upsertAccounts(accounts: MpAccount[]): void {
  const insert = db.transaction((items: MpAccount[]) => {
    for (const account of items) {
      upsertAccount(account);
    }
  });
  insert(accounts);
}

/**
 * 根据 fakeid 获取公众号信息
 */
export function getAccountByFakeid(fakeid: string): MpAccount | null {
  const stmt = db.prepare('SELECT * FROM mp_accounts WHERE fakeid = ?');
  const result = stmt.get(fakeid) as any;
  return result || null;
}

/**
 * 获取所有公众号列表
 */
export function getAllAccounts(): MpAccount[] {
  const stmt = db.prepare('SELECT * FROM mp_accounts ORDER BY created_at DESC');
  return stmt.all() as MpAccount[];
}

/**
 * 删除公众号及其关联数据
 * 注意：由于有外键约束和 CASCADE 删除，删除公众号会自动删除关联的文章和资源
 * 但评论、元数据等需要手动删除（因为它们的外键是 article_id）
 */
export function deleteAccount(fakeid: string): void {
  // 开启事务以确保数据一致性
  const deleteAccount = db.transaction(() => {
    // 删除评论回复（通过 article_id）
    db.prepare(`
      DELETE FROM comment_replies
      WHERE comment_id IN (
        SELECT id FROM comments
        WHERE article_id IN (
          SELECT id FROM articles WHERE fakeid = ?
        )
      )
    `).run(fakeid);

    // 删除评论
    db.prepare(`
      DELETE FROM comments
      WHERE article_id IN (
        SELECT id FROM articles WHERE fakeid = ?
      )
    `).run(fakeid);

    // 删除文章元数据
    db.prepare(`
      DELETE FROM article_metadata
      WHERE article_id IN (
        SELECT id FROM articles WHERE fakeid = ?
      )
    `).run(fakeid);

    // 删除文章 HTML 内容
    db.prepare(`
      DELETE FROM article_html
      WHERE article_id IN (
        SELECT id FROM articles WHERE fakeid = ?
      )
    `).run(fakeid);

    // 删除文章资源关联
    db.prepare(`
      DELETE FROM article_resources
      WHERE article_id IN (
        SELECT id FROM articles WHERE fakeid = ?
      )
    `).run(fakeid);

    // 删除文章（会自动触发 ON DELETE CASCADE 删除关联的 assets）
    db.prepare('DELETE FROM articles WHERE fakeid = ?').run(fakeid);

    // 删除公众号
    db.prepare('DELETE FROM mp_accounts WHERE fakeid = ?').run(fakeid);
  });

  deleteAccount();
}

/**
 * 批量删除公众号及其关联数据
 */
export function deleteAccounts(fakeids: string[]): void {
  const deleteAccounts = db.transaction(() => {
    for (const fakeid of fakeids) {
      deleteAccountByFakeid(fakeid);
    }
  });

  deleteAccounts();
}

/**
 * 删除单个公众号（内部函数，不使用事务）
 */
function deleteAccountByFakeid(fakeid: string): void {
  // 删除评论回复（通过 article_id）
  db.prepare(`
    DELETE FROM comment_replies
    WHERE comment_id IN (
      SELECT id FROM comments
      WHERE article_id IN (
        SELECT id FROM articles WHERE fakeid = ?
      )
    )
  `).run(fakeid);

  // 删除评论
  db.prepare(`
    DELETE FROM comments
    WHERE article_id IN (
      SELECT id FROM articles WHERE fakeid = ?
    )
  `).run(fakeid);

  // 删除文章元数据
  db.prepare(`
    DELETE FROM article_metadata
    WHERE article_id IN (
      SELECT id FROM articles WHERE fakeid = ?
    )
  `).run(fakeid);

  // 删除文章 HTML 内容
  db.prepare(`
    DELETE FROM article_html
    WHERE article_id IN (
      SELECT id FROM articles WHERE fakeid = ?
    )
  `).run(fakeid);

  // 删除文章资源关联
  db.prepare(`
    DELETE FROM article_resources
    WHERE article_id IN (
      SELECT id FROM articles WHERE fakeid = ?
    )
  `).run(fakeid);

  // 删除文章（会自动触发 ON DELETE CASCADE 删除关联的 assets）
  db.prepare('DELETE FROM articles WHERE fakeid = ?').run(fakeid);

  // 删除公众号
  db.prepare('DELETE FROM mp_accounts WHERE fakeid = ?').run(fakeid);
}

/**
 * 更新公众号的最后更新时间
 */
export function updateAccountLastUpdateTime(fakeid: string, timestamp: number): void {
  const stmt = db.prepare('UPDATE mp_accounts SET last_update_time = ? WHERE fakeid = ?');
  stmt.run(timestamp, fakeid);
}

/**
 * 更新公众号的文章统计
 */
export function updateAccountArticleCount(fakeid: string): void {
  const stmt = db.prepare(`
    UPDATE mp_accounts
    SET articles = (
      SELECT COUNT(*) FROM articles WHERE fakeid = ?
    )
    WHERE fakeid = ?
  `);
  stmt.run(fakeid, fakeid);
}

/**
 * 更新公众号的同步统计信息
 * 只更新统计字段，不影响 nickname、round_head_img 等基本信息
 */
export function updateAccountStats(
  fakeid: string,
  stats: {
    total_count?: number;
    count?: number;
    articles?: number;
    completed?: boolean;
    update_time?: number;
    last_update_time?: number;
  }
): void {
  const updates: string[] = [];
  const values: any[] = [];

  if (stats.total_count !== undefined) {
    updates.push('total_count = ?');
    values.push(stats.total_count);
  }
  if (stats.count !== undefined) {
    updates.push('count = ?');
    values.push(stats.count);
  }
  if (stats.articles !== undefined) {
    updates.push('articles = ?');
    values.push(stats.articles);
  }
  if (stats.completed !== undefined) {
    updates.push('completed = ?');
    values.push(stats.completed ? 1 : 0);
  }
  if (stats.update_time !== undefined) {
    updates.push('update_time = ?');
    values.push(stats.update_time);
  }
  if (stats.last_update_time !== undefined) {
    updates.push('last_update_time = ?');
    values.push(stats.last_update_time);
  }

  if (updates.length === 0) {
    return; // 没有需要更新的字段
  }

  values.push(fakeid);
  const stmt = db.prepare(`UPDATE mp_accounts SET ${updates.join(', ')} WHERE fakeid = ?`);
  stmt.run(...values);
}

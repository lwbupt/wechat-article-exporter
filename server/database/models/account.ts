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
 */
export function deleteAccount(fakeid: string): void {
  const stmt = db.prepare('DELETE FROM mp_accounts WHERE fakeid = ?');
  stmt.run(fakeid);
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

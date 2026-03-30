/**
 * 监控日志数据模型
 */

import db from '../index';

export interface MonitorLog {
  id?: number;
  fakeid: string;
  nickname?: string;
  avatar?: string;
  check_time: number;
  new_count: number;
  new_titles?: string; // JSON array
  error?: string;
}

/**
 * 插入监控日志
 */
export function insertMonitorLog(log: MonitorLog): void {
  const stmt = db.prepare(`
    INSERT INTO monitor_logs (fakeid, nickname, avatar, check_time, new_count, new_titles, error)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    log.fakeid,
    log.nickname || null,
    log.avatar || null,
    log.check_time,
    log.new_count || 0,
    log.new_titles ? JSON.stringify(log.new_titles) : null,
    log.error || null,
  );
}

/**
 * 获取最近的监控日志
 */
export function getRecentMonitorLogs(limit = 100): any[] {
  const stmt = db.prepare(
    'SELECT * FROM monitor_logs ORDER BY check_time DESC LIMIT ?',
  );
  const rows = stmt.all(limit) as any[];
  return rows.map(row => ({
    ...row,
    new_titles: row.new_titles ? JSON.parse(row.new_titles) : [],
  }));
}

/**
 * 清空监控日志
 */
export function clearMonitorLogs(): void {
  db.exec('DELETE FROM monitor_logs');
}

/**
 * 获取监控日志数量
 */
export function getMonitorLogCount(): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM monitor_logs').get() as { count: number };
  return result.count;
}

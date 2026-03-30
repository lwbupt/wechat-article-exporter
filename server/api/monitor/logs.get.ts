/**
 * 获取监控日志
 */
import { getRecentMonitorLogs, getMonitorLogCount } from '../../database/models/monitor-log';

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const limit = Number(query.limit) || 100;

  const logs = getRecentMonitorLogs(limit);
  const total = getMonitorLogCount();

  return {
    logs,
    total,
  };
});

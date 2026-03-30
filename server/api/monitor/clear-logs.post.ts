/**
 * 清空监控日志
 */
import { clearMonitorLogs } from '../../database/models/monitor-log';

export default defineEventHandler(() => {
  clearMonitorLogs();
  return { success: true };
});

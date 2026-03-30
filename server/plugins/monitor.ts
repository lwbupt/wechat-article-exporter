/**
 * 定时监控公众号最新发文 - Nitro 插件入口
 * 仅负责在服务启动时初始化调度器
 * 核心逻辑在 server/utils/monitor-scheduler.ts（Nitro 自动导入）
 */

export default defineNitroPlugin(() => {
  const scheduleStr = [0, 4, 8, 12, 16, 20].map(h => `${String(h).padStart(2, '0')}:00`).join(' / ');
  console.log(`[Monitor] 注册定时监控任务: 每日 ${scheduleStr}`);
  startScheduler();
});

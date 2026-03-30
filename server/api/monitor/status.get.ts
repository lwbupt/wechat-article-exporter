/**
 * 获取监控状态
 */

export default defineEventHandler(() => {
  return {
    running: getIsCheckRunning(),
    enabled: getIsSchedulerEnabled(),
    cronExpression: '0 0,4,8,12,16,20 * * *',
    timezone: 'Asia/Shanghai',
    checkArticleCount: 2,
  };
});

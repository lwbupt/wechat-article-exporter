/**
 * 手动触发一次监控检查
 */

export default defineEventHandler(async () => {
  if (getIsCheckRunning()) {
    return {
      success: false,
      message: '上一轮检查尚未完成，请稍后再试',
    };
  }

  // 异步执行，不阻塞响应
  runMonitorCheck();

  return {
    success: true,
    message: '已触发检查',
  };
});

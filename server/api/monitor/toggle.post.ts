/**
 * 启停定时调度器
 */

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const enable = body?.enabled ?? !getIsSchedulerEnabled();

  if (enable) {
    startScheduler();
  } else {
    stopScheduler();
  }

  return {
    success: true,
    enabled: getIsSchedulerEnabled(),
  };
});

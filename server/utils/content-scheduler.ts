/**
 * 内容生成定时调度器
 * - 每日生文任务（可配置时间）
 * - 每小时续跑失败任务
 * - 每分钟检查定时发布
 */

import { triggerDailyWorkflows, retryFailedWorkflows, pushReadyArticles } from './workflow-engine';
import db from '~/server/database/index';

const GLOBAL_KEY = '__content_scheduler__';

const DEFAULT_GEN_TIME = '06:00';
const DEFAULT_RETRY_MINUTE = 30;

function getState() {
  if (!globalThis[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = {
      isRunning: false,
      timer: null as ReturnType<typeof setInterval> | null,
      lastGenDate: '',
      lastRetryHour: -1,
    };
  }
  return (globalThis as any)[GLOBAL_KEY] as {
    isRunning: boolean;
    timer: ReturnType<typeof setInterval> | null;
    lastGenDate: string;
    lastRetryHour: number;
  };
}

function getSchedulerConfig() {
  try {
    const genRow = db.prepare("SELECT value FROM settings WHERE key = 'scheduler_gen_time'").get() as { value: string } | undefined;
    const retryRow = db.prepare("SELECT value FROM settings WHERE key = 'scheduler_retry_minute'").get() as { value: string } | undefined;
    return {
      genTime: genRow?.value || DEFAULT_GEN_TIME,
      retryMinute: retryRow?.value ? parseInt(retryRow.value, 10) : DEFAULT_RETRY_MINUTE,
    };
  } catch {
    return { genTime: DEFAULT_GEN_TIME, retryMinute: DEFAULT_RETRY_MINUTE };
  }
}

export function startContentScheduler() {
  const state = getState();
  if (state.isRunning) return;

  state.isRunning = true;
  console.log('[ContentScheduler] Starting...');

  state.timer = setInterval(async () => {
    try {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const today = now.toISOString().split('T')[0];

      const config = getSchedulerConfig();

      // 每日生文：按配置时间触发（每天只触发一次）
      const [genHour, genMin] = config.genTime.split(':').map(Number);
      if (hour === genHour && minute === genMin && state.lastGenDate !== today) {
        state.lastGenDate = today;
        console.log(`[ContentScheduler] Triggering daily workflows at ${config.genTime}...`);
        const result = await triggerDailyWorkflows();
        console.log(`[ContentScheduler] Created ${result.created} workflows, ${result.errors.length} errors`);
      }

      // 续跑失败任务：每小时按配置分钟触发
      if (minute === config.retryMinute && state.lastRetryHour !== hour) {
        state.lastRetryHour = hour;
        console.log('[ContentScheduler] Retrying failed workflows...');
        const count = await retryFailedWorkflows();
        if (count > 0) console.log(`[ContentScheduler] Retrying ${count} workflows`);
      }

      // 定时发布：每分钟检查
      await pushReadyArticles();
    } catch (err) {
      console.error('[ContentScheduler] Error:', err);
    }
  }, 60 * 1000); // 每分钟检查
}

export function stopContentScheduler() {
  const state = getState();
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  state.isRunning = false;
  console.log('[ContentScheduler] Stopped');
}

/**
 * 定时监控公众号最新发文 - 前端 composable
 * 服务端使用 setInterval 定时执行，前端仅做状态展示和手动触发
 */

import { getAllInfo, type MpAccount } from '~/store/v2/info';

export interface MonitorLog {
  id: number;
  fakeid: string;
  nickname: string;
  avatar?: string;
  check_time: number;
  new_count: number;
  new_titles: string[];
  error?: string;
}

const monitorLogs = ref<MonitorLog[]>([]);
const running = ref(false);
const enabled = ref(true);
const nextRunTime = ref<number | null>(null);
const checking = ref(false);

export function useMonitor() {
  const logs = computed(() => monitorLogs.value);

  /**
   * 计算下一次 cron 执行时间（对齐到 0/4/8/12/16/20 点）
   */
  function calcNextRunTime(): number {
    const now = new Date();
    const hours = now.getHours();
    const alignedHours = [0, 4, 8, 12, 16, 20];
    let nextHour = alignedHours.find(h => h > hours);
    const next = new Date(now);
    if (nextHour === undefined) {
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
    } else {
      next.setHours(nextHour, 0, 0, 0);
    }
    return next.getTime();
  }

  /**
   * 从服务端加载日志
   */
  async function loadLogs() {
    try {
      const resp = await $fetch<{ logs: MonitorLog[]; total: number }>('/api/monitor/logs');
      monitorLogs.value = resp.logs;
    } catch (e) {
      console.error('[Monitor] 加载日志失败:', e);
    }
  }

  /**
   * 从服务端加载状态
   */
  async function loadStatus() {
    try {
      const resp = await $fetch<{ running: boolean; enabled: boolean; cronExpression: string }>('/api/monitor/status');
      running.value = resp.running;
      enabled.value = resp.enabled;
      if (resp.enabled) {
        nextRunTime.value = calcNextRunTime();
      } else {
        nextRunTime.value = null;
      }
    } catch (e) {
      console.error('[Monitor] 加载状态失败:', e);
    }
  }

  /**
   * 切换调度器启停
   */
  async function toggleScheduler(value?: boolean) {
    try {
      const resp = await $fetch<{ success: boolean; enabled: boolean }>('/api/monitor/toggle', {
        method: 'POST',
        body: { enabled: value },
      });
      if (resp.success) {
        enabled.value = resp.enabled;
        nextRunTime.value = resp.enabled ? calcNextRunTime() : null;
      }
    } catch (e) {
      console.error('[Monitor] 切换调度器失败:', e);
    }
  }

  /**
   * 手动触发一次检查
   */
  async function manualCheck() {
    checking.value = true;
    try {
      const resp = await $fetch<{ success: boolean; message: string }>('/api/monitor/trigger', {
        method: 'POST',
      });
      if (resp.success) {
        // 等待检查完成后刷新日志
        setTimeout(() => {
          loadLogs();
          loadStatus();
          checking.value = false;
        }, 3000);
      } else {
        checking.value = false;
      }
    } catch (e) {
      console.error('[Monitor] 触发检查失败:', e);
      checking.value = false;
    }
  }

  /**
   * 清空日志
   */
  async function clearLogs() {
    try {
      await $fetch('/api/monitor/clear-logs', { method: 'POST' });
      monitorLogs.value = [];
    } catch (e) {
      console.error('[Monitor] 清空日志失败:', e);
    }
  }

  /**
   * 获取被监控的公众号列表
   */
  async function getMonitoredAccounts(): Promise<MpAccount[]> {
    const allAccounts = await getAllInfo();
    return allAccounts.filter(acc => acc.is_monitored);
  }

  // 初始化时加载数据
  loadStatus();
  loadLogs();

  return {
    logs,
    running,
    enabled,
    checking,
    nextRunTime,
    toggleScheduler,
    manualCheck,
    clearLogs,
    getMonitoredAccounts,
  };
}

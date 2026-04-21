<script setup lang="ts">
import toastFactory from '~/composables/toast';

const toast = toastFactory();

const genTime = ref('06:00');
const retryMinute = ref(30);
const saving = ref(false);

async function loadSchedulerConfig() {
  try {
    const [genResp, retryResp] = await Promise.all([
      $fetch<{ success: boolean; data?: string }>('/api/query/settings?key=scheduler_gen_time'),
      $fetch<{ success: boolean; data?: string }>('/api/query/settings?key=scheduler_retry_minute'),
    ]);
    if (genResp.success && genResp.data) genTime.value = genResp.data;
    if (retryResp.success && retryResp.data) retryMinute.value = parseInt(retryResp.data, 10) || 30;
  } catch { /* 静默 */ }
}

async function saveSchedulerConfig() {
  saving.value = true;
  try {
    await Promise.all([
      $fetch('/api/query/settings', { method: 'POST', body: { key: 'scheduler_gen_time', value: genTime.value } }),
      $fetch('/api/query/settings', { method: 'POST', body: { key: 'scheduler_retry_minute', value: String(retryMinute.value) } }),
    ]);
    toast.success('保存成功', '调度配置已更新，下一轮调度生效');
  } catch (err: any) {
    toast.error('保存失败', err?.message || '未知错误');
  } finally {
    saving.value = false;
  }
}

onMounted(loadSchedulerConfig);
</script>

<template>
  <div class="h-full overflow-scroll">
    <SettingProxy />
    <div class="flex flex-wrap">
      <SettingExport />
      <SettingMisc />
    </div>

    <!-- 调度配置 -->
    <div class="mt-6 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
      <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">调度配置</h3>
      <div class="flex flex-wrap items-end gap-4">
        <div>
          <label class="block text-xs text-gray-500 mb-1">每日生文时间</label>
          <input
            v-model="genTime"
            type="time"
            class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <p class="text-xs text-gray-400 mt-1">自动为启用自动发布的账号创建工作流</p>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">重试间隔（分钟）</label>
          <select
            v-model.number="retryMinute"
            class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option :value="0">整点</option>
            <option :value="15">15分</option>
            <option :value="30">30分</option>
            <option :value="45">45分</option>
          </select>
          <p class="text-xs text-gray-400 mt-1">每小时在指定分钟检查并重试失败任务</p>
        </div>
        <UButton color="blue" size="sm" :loading="saving" @click="saveSchedulerConfig">保存</UButton>
      </div>
    </div>

    <div class="h-[30vh]"></div>
  </div>
</template>

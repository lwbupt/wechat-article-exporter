<script setup lang="ts">
import { formatTimeStamp } from '#shared/utils/helpers';
import { websiteName } from '~/config';
import { getAllInfo, type MpAccount } from '~/store/v2/info';

useHead({
  title: `定时监控 | ${websiteName}`,
});

const { logs, running, enabled, checking, nextRunTime, toggleScheduler, manualCheck, clearLogs } = useMonitor();

// 被监控的公众号列表
const monitoredAccounts = ref<MpAccount[]>([]);

async function loadMonitoredAccounts() {
  const all = await getAllInfo();
  monitoredAccounts.value = all.filter(acc => acc.is_monitored);
}

// 格式化下次执行时间
const nextRunText = computed(() => {
  if (!nextRunTime.value) return '';
  return new Date(nextRunTime.value).toLocaleString('zh-CN');
});

// 初始化时加载公众号列表
onMounted(async () => {
  await loadMonitoredAccounts();
});

function hasError(log: any): boolean {
  return !!log.error;
}
</script>

<template>
  <div class="h-full">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">定时监控</h1>
    </Teleport>

    <div class="h-full overflow-auto">
      <!-- 监控配置 -->
      <UCard class="mx-4 mt-4">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-2xl font-semibold">监控配置</h3>
            <div class="flex items-center gap-2">
              <span
                class="inline-flex items-center gap-1 text-sm"
                :class="running ? 'text-orange-500' : enabled ? 'text-green-500' : 'text-gray-400'"
              >
                <span
                  class="w-2 h-2 rounded-full"
                  :class="running ? 'bg-orange-500 animate-pulse' : enabled ? 'bg-green-500' : 'bg-gray-400'"
                />
                {{ running ? '检查中...' : enabled ? '调度运行中' : '调度已停止' }}
              </span>
            </div>
          </div>
        </template>

        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-4">
            <UIcon name="i-lucide:clock" class="size-5 text-gray-400" />
            <span class="text-sm text-gray-600 dark:text-gray-300">
              执行策略：每日 00:00 起，每隔 4 小时自动检查（00:00 / 04:00 / 08:00 / 12:00 / 16:00 / 20:00）
            </span>
          </div>
          <div v-if="enabled && nextRunText" class="flex items-center gap-4">
            <UIcon name="i-lucide:timer" class="size-5 text-gray-400" />
            <span class="text-sm text-gray-600 dark:text-gray-300">下次执行：{{ nextRunText }}</span>
          </div>

          <div class="flex gap-2">
            <UButton
              v-if="enabled"
              color="red"
              variant="outline"
              icon="i-lucide:square"
              :disabled="running"
              @click="toggleScheduler(false)"
            >
              停止调度
            </UButton>
            <UButton
              v-else
              color="green"
              icon="i-lucide:play"
              @click="toggleScheduler(true)"
            >
              启动调度
            </UButton>
            <UButton
              color="blue"
              icon="i-lucide:refresh-cw"
              :loading="checking"
              :disabled="running || !enabled"
              @click="manualCheck()"
            >
              立即检查
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- 被监控的公众号 -->
      <UCard class="mx-4 mt-4">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-semibold">
              监控中的公众号
              <UBadge color="primary" variant="subtle" class="ml-2">{{ monitoredAccounts.length }}</UBadge>
            </h3>
          </div>
        </template>

        <div v-if="monitoredAccounts.length === 0" class="text-center py-8 text-gray-400">
          <p>暂无监控中的公众号</p>
          <p class="text-sm mt-1">
            请在
            <NuxtLink to="/dashboard/account" class="text-blue-500 hover:underline">公众号管理</NuxtLink>
            页面中，为公众号开启监控开关
          </p>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="account in monitoredAccounts"
            :key="account.fakeid"
            class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <img
              v-if="account.round_head_img"
              :src="account.round_head_img"
              alt=""
              class="w-10 h-10 rounded-full object-cover border border-gray-200"
            />
            <div v-else class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              <UIcon name="i-lucide:user" class="size-5 text-gray-400" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium truncate">{{ account.nickname }}</p>
              <p v-if="account.category" class="text-xs text-gray-400">
                {{ account.category }}
              </p>
            </div>
            <UBadge color="green" variant="subtle" size="xs">监控中</UBadge>
          </div>
        </div>
      </UCard>

      <!-- 监控日志 -->
      <UCard class="mx-4 mt-4 mb-4">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-semibold">
              监控日志
              <UBadge color="gray" variant="subtle" class="ml-2">{{ logs.length }}</UBadge>
            </h3>
            <UButton color="gray" variant="ghost" icon="i-lucide:trash-2" size="xs" @click="clearLogs()">
              清空
            </UButton>
          </div>
        </template>

        <div v-if="logs.length === 0" class="text-center py-8 text-gray-400">
          <p>暂无监控日志</p>
          <p class="text-sm mt-1">启动监控后，每次检查的结果将记录在此</p>
        </div>

        <div v-else class="max-h-[400px] overflow-auto">
          <div
            v-for="log in logs"
            :key="log.id"
            class="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
          >
            <img
              v-if="log.avatar"
              :src="log.avatar"
              alt=""
              class="w-6 h-6 rounded-full object-cover mt-0.5 flex-shrink-0"
            />
            <UIcon v-else name="i-lucide:user" class="size-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-sm">{{ log.nickname }}</span>
                <span class="text-xs text-gray-400 font-mono">{{ formatTimeStamp(log.check_time) }}</span>
              </div>
              <p v-if="hasError(log)" class="text-sm text-red-500 mt-0.5">{{ log.error }}</p>
              <p v-else-if="log.new_count > 0" class="text-sm text-blue-500 mt-0.5">
                发现 {{ log.new_count }} 篇新文章
              </p>
              <p v-else class="text-sm text-gray-400 mt-0.5">暂无新文章</p>
              <div v-if="log.new_titles && log.new_titles.length > 0" class="mt-1">
                <p v-for="title in log.new_titles" :key="title" class="text-xs text-gray-500 truncate">
                  - {{ title }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <div class="h-[5vh]"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import toastFactory from '~/composables/toast';

const toast = toastFactory();

// 运营中的公众号
interface ManagedAccount {
  id: number;
  name: string;
  category: string;
  persona: string;
  enabled: boolean;
}

interface TopicItem {
  title: string;
  angle: string;
  viralPoint: string;
}

interface DailyTopic {
  id: number;
  topic_date: string;
  category: string;
  title: string;
  angle: string;
  viral_point: string;
  email_subject: string;
}

const accounts = ref<ManagedAccount[]>([]);
const selectedAccountId = ref<number | null>(null);
const generating = ref(false);
const topics = ref<TopicItem[]>([]);

// 每日话题
const fetchingTopics = ref(false);
const dailyTopics = ref<DailyTopic[]>([]);
const availableDates = ref<string[]>([]);
const selectedDate = ref(new Date().toISOString().split('T')[0]);

async function loadAccounts() {
  try {
    const resp = await $fetch<{ success: boolean; data?: ManagedAccount[] }>('/api/query/managed-accounts');
    if (resp.success && resp.data) {
      accounts.value = resp.data.filter(a => a.enabled);
    }
  } catch {
    // 静默
  }
}

async function loadDailyTopics() {
  try {
    const resp = await $fetch<{
      success: boolean;
      data?: { date: string; topics: DailyTopic[]; availableDates: string[] };
    }>('/api/query/content/daily-topics', { params: { date: selectedDate.value } });
    if (resp.success && resp.data) {
      dailyTopics.value = resp.data.topics;
      availableDates.value = resp.data.availableDates;
    }
  } catch {
    // 静默
  }
}

onMounted(() => {
  loadAccounts();
  loadDailyTopics();
});

watch(selectedDate, () => {
  loadDailyTopics();
});

const selectedAccount = computed(() => {
  return accounts.value.find(a => a.id === selectedAccountId.value);
});

// 按分类分组每日话题
const groupedTopics = computed(() => {
  const map = new Map<string, DailyTopic[]>();
  for (const t of dailyTopics.value) {
    const list = map.get(t.category) || [];
    list.push(t);
    map.set(t.category, list);
  }
  return map;
});

async function generateTopics() {
  if (!selectedAccountId.value) {
    toast.error('请选择', '请先选择一个运营公众号');
    return;
  }

  generating.value = true;
  topics.value = [];

  try {
    const resp = await $fetch<{ success: boolean; data?: TopicItem[]; error?: string }>('/api/query/content/topics', {
      method: 'POST',
      body: { accountId: selectedAccountId.value },
    });

    if (resp.success && resp.data) {
      topics.value = resp.data;
    } else {
      toast.error('生成失败', resp.error || '未知错误');
    }
  } catch (err: any) {
    toast.error('生成失败', err?.message || '请求失败');
  } finally {
    generating.value = false;
  }
}

async function fetchDailyTopics() {
  fetchingTopics.value = true;
  try {
    const resp = await $fetch<{ success: boolean; data?: { date: string; totalTopics: number }; error?: string }>(
      '/api/query/content/fetch-topics',
      { method: 'POST' }
    );

    if (resp.success && resp.data) {
      toast.success('获取成功', `已生成 ${resp.data.totalTopics} 个话题`);
      selectedDate.value = resp.data.date;
      await loadDailyTopics();
    } else {
      toast.error('获取失败', resp.error || '未知错误');
    }
  } catch (err: any) {
    toast.error('获取失败', err?.message || '请求失败');
  } finally {
    fetchingTopics.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col h-full gap-4">
    <!-- 每日话题区域 -->
    <div class="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 p-4">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide:mail" class="size-5 text-blue-500" />
          <h3 class="font-medium text-sm">每日话题（TrendRadar 邮件）</h3>
        </div>
        <div class="flex items-center gap-2">
          <select
            v-model="selectedDate"
            class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option v-for="d in availableDates" :key="d" :value="d">{{ d }}</option>
            <option v-if="availableDates.length === 0" :value="selectedDate">{{ selectedDate }}</option>
          </select>
          <UButton
            icon="i-lucide:refresh-cw"
            color="blue"
            size="xs"
            :loading="fetchingTopics"
            :disabled="fetchingTopics"
            @click="fetchDailyTopics"
          >
            {{ fetchingTopics ? '获取中...' : '获取今日话题' }}
          </UButton>
        </div>
      </div>

      <!-- 获取中 -->
      <div v-if="fetchingTopics" class="flex items-center justify-center py-6">
        <div class="text-center">
          <UIcon name="i-lucide:brain" class="size-10 text-blue-500 animate-pulse mb-2" />
          <p class="text-xs text-gray-500">正在从邮箱获取 TrendRadar 并生成话题...</p>
        </div>
      </div>

      <!-- 话题列表（按分类分组） -->
      <div v-else-if="dailyTopics.length > 0" class="space-y-3 max-h-[400px] overflow-auto">
        <div v-for="[cat, items] in groupedTopics" :key="cat" class="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <span class="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded">{{ cat }}</span>
            <span class="text-xs text-gray-400">{{ items.length }} 个话题</span>
          </div>
          <div class="p-2 space-y-1.5">
            <div v-for="topic in items" :key="topic.id" class="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <span class="shrink-0 w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400 flex items-center justify-center text-[10px] font-bold mt-0.5">
                {{ items.indexOf(topic) + 1 }}
              </span>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-medium">{{ topic.title }}</p>
                <p class="text-[10px] text-gray-400 mt-0.5">
                  <span v-if="topic.angle">角度：{{ topic.angle }}</span>
                  <span v-if="topic.viral_point" class="ml-2 text-orange-400">爆点：{{ topic.viral_point }}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="text-center py-6 text-gray-400">
        <UIcon name="i-lucide:inbox" class="size-8 mb-2 opacity-40" />
        <p class="text-xs">暂无每日话题，点击"获取今日话题"从邮箱获取</p>
      </div>
    </div>

    <!-- 分割线 -->
    <div class="flex items-center gap-3">
      <div class="flex-1 border-t border-gray-200 dark:border-gray-700" />
      <span class="text-xs text-gray-400">或手动生成选题</span>
      <div class="flex-1 border-t border-gray-200 dark:border-gray-700" />
    </div>

    <!-- 手动选题区 -->
    <div class="flex items-center gap-3">
      <select
        v-model="selectedAccountId"
        class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[200px]"
      >
        <option :value="null" disabled>选择运营公众号</option>
        <option v-for="acc in accounts" :key="acc.id" :value="acc.id">{{ acc.name }}（{{ acc.category || '未分类' }}）</option>
      </select>
      <UButton icon="i-lucide:sparkles" color="blue" :loading="generating" :disabled="!selectedAccountId" @click="generateTopics">
        {{ generating ? '生成中...' : '生成选题' }}
      </UButton>
    </div>

    <!-- 公众号信息 -->
    <div v-if="selectedAccount" class="text-xs text-gray-400">
      分类：{{ selectedAccount.category || '未分类' }}
      <span v-if="selectedAccount.persona" class="ml-3">人设：{{ selectedAccount.persona }}</span>
    </div>

    <!-- 生成中 -->
    <div v-if="generating" class="flex items-center justify-center py-12">
      <div class="text-center">
        <UIcon name="i-lucide:brain" class="size-12 text-blue-500 animate-pulse mb-3" />
        <p class="text-gray-500">AI 正在分析热点并生成选题...</p>
      </div>
    </div>

    <!-- 选题结果 -->
    <div v-else-if="topics.length > 0" class="flex-1 min-h-0 overflow-auto space-y-3">
      <div
        v-for="(topic, idx) in topics"
        :key="idx"
        class="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
      >
        <div class="flex items-start gap-3">
          <span class="shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold">{{ idx + 1 }}</span>
          <div class="flex-1 min-w-0">
            <p class="font-medium text-sm">{{ topic.title }}</p>
            <p class="text-xs text-gray-500 mt-1">核心角度：{{ topic.angle }}</p>
            <p class="text-xs text-orange-500 mt-0.5">预计爆点：{{ topic.viralPoint }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!generating && dailyTopics.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-center text-gray-400">
        <UIcon name="i-lucide:lightbulb" class="size-16 mb-3 opacity-40" />
        <p class="text-lg">从邮箱获取每日话题，或选择公众号手动生成选题</p>
        <p class="text-sm mt-1">基于 TrendRadar 邮件和公众号人设智能生成选题建议</p>
      </div>
    </div>
  </div>
</template>

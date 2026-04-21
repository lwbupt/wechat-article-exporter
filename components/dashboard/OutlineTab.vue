<script setup lang="ts">
import toastFactory from '~/composables/toast';

const toast = toastFactory();

interface DailyTopic {
  id: number;
  topic_date: string;
  category: string;
  title: string;
  angle: string;
  viral_point: string;
}

const topics = ref<DailyTopic[]>([]);
const selectedTopicId = ref<number | null>(null);
const generating = ref(false);
const outline = ref('');

// 参考风格
interface StyleOption {
  fakeid: string;
  account_name: string;
  article_count: number;
  overall_summary: string;
}
const styleOptions = ref<StyleOption[]>([]);
const selectedStyleFakeid = ref('');  // '' = 自动匹配, 'none' = 不使用, 具体 fakeid = 指定风格

// 提示词
const promptVisible = ref(false);
const promptEditing = ref(false);
const promptText = ref('');
const promptDraft = ref('');
const promptSaving = ref(false);

// 选题信息
const selectedTopic = computed(() => {
  return topics.value.find(t => t.id === selectedTopicId.value);
});

// 按分类分组
const groupedTopics = computed(() => {
  const map = new Map<string, DailyTopic[]>();
  for (const t of topics.value) {
    const list = map.get(t.category) || [];
    list.push(t);
    map.set(t.category, list);
  }
  return map;
});

async function loadTopics() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const resp = await $fetch<{
      success: boolean;
      data?: { topics: DailyTopic[] };
    }>('/api/query/content/daily-topics', { params: { date: today } });
    if (resp.success && resp.data) {
      topics.value = resp.data.topics;
    }
  } catch {
    // 静默
  }
}

async function loadPrompt() {
  try {
    const resp = await $fetch<{ success: boolean; data?: string }>('/api/query/settings?key=outline_prompt');
    if (resp.success && resp.data) {
      promptText.value = resp.data;
    }
  } catch {
    // 静默
  }
}

function startEditPrompt() {
  promptDraft.value = promptText.value;
  promptEditing.value = true;
}

function cancelEditPrompt() {
  promptEditing.value = false;
}

async function savePrompt() {
  promptSaving.value = true;
  try {
    const resp = await $fetch<{ success: boolean }>('/api/query/settings', {
      method: 'POST',
      body: { key: 'outline_prompt', value: promptDraft.value },
    });
    if (resp.success) {
      promptText.value = promptDraft.value;
      promptEditing.value = false;
      toast.success('保存成功', '大纲提示词已更新');
    }
  } catch (err: any) {
    toast.error('保存失败', err?.message || '未知错误');
  } finally {
    promptSaving.value = false;
  }
}

onMounted(() => {
  loadTopics();
  loadPrompt();
  loadStyleOptions();
});

async function loadStyleOptions() {
  try {
    const resp = await $fetch<{ success: boolean; data?: StyleOption[] }>('/api/query/content/style-analysis');
    if (resp.success && resp.data) {
      styleOptions.value = Array.isArray(resp.data) ? resp.data : [];
    }
  } catch {
    // 静默
  }
}

async function generateOutline() {
  if (!selectedTopic.value) {
    toast.error('请选择', '请先选择一个选题');
    return;
  }

  generating.value = true;
  outline.value = '';

  try {
    const resp = await $fetch<{ success: boolean; data?: string; error?: string }>('/api/query/content/outline', {
      method: 'POST',
      body: {
        topicId: selectedTopic.value.id,
        title: selectedTopic.value.title,
        angle: selectedTopic.value.angle,
        viralPoint: selectedTopic.value.viral_point,
        category: selectedTopic.value.category,
        styleFakeid: selectedStyleFakeid.value === 'none' ? '' : selectedStyleFakeid.value,
      },
    });

    if (resp.success && resp.data) {
      outline.value = resp.data;
      localStorage.setItem('content_gen_outline', resp.data);
      localStorage.setItem('content_gen_topic_id', String(selectedTopic.value.id));
    } else {
      toast.error('生成失败', resp.error || '未知错误');
    }
  } catch (err: any) {
    toast.error('生成失败', err?.message || '请求失败');
  } finally {
    generating.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col h-full gap-4">
    <!-- 选题选择区 -->
    <div class="flex items-center gap-3">
      <select
        v-model="selectedTopicId"
        class="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <option :value="null" disabled>选择今日选题</option>
        <optgroup v-for="[cat, items] in groupedTopics" :key="cat" :label="cat">
          <option v-for="t in items" :key="t.id" :value="t.id">{{ t.title }}</option>
        </optgroup>
      </select>
      <UButton
        icon="i-lucide:sparkles"
        color="blue"
        :loading="generating"
        :disabled="generating || !selectedTopicId"
        @click="generateOutline"
      >
        {{ generating ? '生成中...' : '生成大纲' }}
      </UButton>
    </div>

    <!-- 选题信息 -->
    <div v-if="selectedTopic" class="text-xs text-gray-500 space-y-0.5">
      <p><span class="text-gray-400">分类：</span><span class="text-blue-500">{{ selectedTopic.category }}</span></p>
      <p v-if="selectedTopic.angle"><span class="text-gray-400">角度：</span>{{ selectedTopic.angle }}</p>
      <p v-if="selectedTopic.viral_point"><span class="text-gray-400">爆点：</span><span class="text-orange-500">{{ selectedTopic.viral_point }}</span></p>
    </div>

    <!-- 参考风格选择 -->
    <div v-if="styleOptions.length > 0" class="flex items-center gap-2">
      <span class="text-xs text-gray-400 shrink-0">参考风格：</span>
      <select
        v-model="selectedStyleFakeid"
        class="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <option value="">自动匹配（按分类）</option>
        <option value="none">不使用风格</option>
        <option v-for="s in styleOptions" :key="s.fakeid" :value="s.fakeid">{{ s.account_name }}（{{ s.article_count }}篇）</option>
      </select>
    </div>

    <!-- 无选题提示 -->
    <div v-if="topics.length === 0" class="text-center py-6 text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
      <UIcon name="i-lucide:inbox" class="size-8 mb-2 opacity-40" />
      <p class="text-xs">暂无今日选题，请先在"选题生成"中获取每日话题</p>
    </div>

    <!-- 提示词面板 -->
    <div class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div
        class="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 cursor-pointer select-none"
        @click="promptVisible = !promptVisible"
      >
        <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <UIcon :name="promptVisible ? 'i-lucide:chevron-down' : 'i-lucide:chevron-right'" class="size-4" />
          <UIcon name="i-lucide:message-square-text" class="size-4" />
          <span class="font-medium">大纲提示词</span>
        </div>
        <div class="flex items-center gap-2">
          <UBadge v-if="promptText" color="green" variant="subtle" size="xs">已配置</UBadge>
          <UBadge v-else color="red" variant="subtle" size="xs">未配置</UBadge>
        </div>
      </div>
      <div v-if="promptVisible" class="p-3">
        <div v-if="!promptEditing">
          <pre class="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-auto bg-white dark:bg-gray-900 rounded p-3 border border-gray-100 dark:border-gray-700">{{ promptText || '暂无提示词（使用默认）' }}</pre>
          <div class="flex justify-end mt-2">
            <UButton icon="i-lucide:pencil" size="xs" variant="outline" @click="startEditPrompt">
              编辑提示词
            </UButton>
          </div>
        </div>
        <div v-else class="space-y-2">
          <textarea
            v-model="promptDraft"
            class="w-full h-[200px] text-xs p-3 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
            placeholder="输入大纲提示词..."
          />
          <div class="flex justify-end gap-2">
            <UButton size="xs" variant="ghost" color="gray" @click="cancelEditPrompt">
              取消
            </UButton>
            <UButton size="xs" color="blue" :loading="promptSaving" @click="savePrompt">
              保存
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <!-- 生成中 -->
    <div v-if="generating" class="flex items-center justify-center py-12">
      <div class="text-center">
        <UIcon name="i-lucide:brain" class="size-12 text-blue-500 animate-pulse mb-3" />
        <p class="text-gray-500">AI 正在基于选题和爆款模板生成大纲...</p>
      </div>
    </div>

    <!-- 大纲结果 -->
    <div v-else-if="outline" class="flex-1 min-h-0 overflow-auto">
      <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{{ outline }}</div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="topics.length > 0 && !generating" class="flex-1 flex items-center justify-center">
      <div class="text-center text-gray-400">
        <UIcon name="i-lucide:list-tree" class="size-16 mb-3 opacity-40" />
        <p class="text-lg">选择今日选题，AI 生成结构化内容大纲</p>
        <p class="text-sm mt-1">结合选题爆点和该分类爆款写作模板生成大纲</p>
      </div>
    </div>
  </div>
</template>

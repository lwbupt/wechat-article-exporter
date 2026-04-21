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

interface Material {
  id: number;
  source: string;
  title: string;
  content: string;
  url: string;
}

const topics = ref<DailyTopic[]>([]);
const selectedTopicId = ref<number | null>(null);
const gathering = ref(false);
const materials = ref<Material[]>([]);
const localMaterials = ref<Material[]>([]);
const webMaterials = ref<Material[]>([]);

const selectedTopic = computed(() => {
  return topics.value.find(t => t.id === selectedTopicId.value);
});

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

async function loadMaterials() {
  if (!selectedTopicId.value) return;
  try {
    const resp = await $fetch<{
      success: boolean;
      data?: { materials: Material[]; local: Material[]; web: Material[] };
    }>('/api/query/content/materials', { params: { topicId: selectedTopicId.value } });
    if (resp.success && resp.data) {
      materials.value = resp.data.materials;
      localMaterials.value = resp.data.local;
      webMaterials.value = resp.data.web;
    }
  } catch {
    // 静默
  }
}

watch(selectedTopicId, () => {
  materials.value = [];
  localMaterials.value = [];
  webMaterials.value = [];
  loadMaterials();
});

onMounted(() => {
  loadTopics();
});

async function gatherMaterials() {
  if (!selectedTopic.value) {
    toast.error('请选择', '请先选择一个选题');
    return;
  }

  gathering.value = true;
  try {
    const resp = await $fetch<{ success: boolean; data?: { total: number; local: number; web: number }; error?: string }>(
      '/api/query/content/gather-materials',
      {
        method: 'POST',
        body: {
          topicId: selectedTopic.value.id,
          title: selectedTopic.value.title,
          category: selectedTopic.value.category,
          angle: selectedTopic.value.angle || '',
          viralPoint: selectedTopic.value.viral_point || '',
        },
      }
    );

    if (resp.success) {
      toast.success('搜集完成', `共 ${resp.data?.total || 0} 条素材（本地 ${resp.data?.local || 0}，网络 ${resp.data?.web || 0}）`);
      await loadMaterials();
    } else {
      toast.error('搜集失败', resp.error || '未知错误');
    }
  } catch (err: any) {
    toast.error('搜集失败', err?.message || '请求失败');
  } finally {
    gathering.value = false;
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
        icon="i-lucide:search"
        color="blue"
        :loading="gathering"
        :disabled="gathering || !selectedTopicId"
        @click="gatherMaterials"
      >
        {{ gathering ? '搜集中...' : '搜集素材' }}
      </UButton>
    </div>

    <!-- 选题信息 -->
    <div v-if="selectedTopic" class="text-xs text-gray-500 space-y-0.5">
      <p><span class="text-gray-400">分类：</span><span class="text-blue-500">{{ selectedTopic.category }}</span>
        <span v-if="selectedTopic.angle" class="ml-3"><span class="text-gray-400">角度：</span>{{ selectedTopic.angle }}</span>
        <span v-if="selectedTopic.viral_point" class="ml-3"><span class="text-gray-400">爆点：</span><span class="text-orange-500">{{ selectedTopic.viral_point }}</span></span>
      </p>
    </div>

    <!-- 无选题 -->
    <div v-if="topics.length === 0" class="text-center py-6 text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
      <UIcon name="i-lucide:inbox" class="size-8 mb-2 opacity-40" />
      <p class="text-xs">暂无今日选题，请先在"选题生成"中获取每日话题</p>
    </div>

    <!-- 搜集中 -->
    <div v-if="gathering" class="flex items-center justify-center py-12">
      <div class="text-center">
        <UIcon name="i-lucide:search" class="size-12 text-blue-500 animate-pulse mb-3" />
        <p class="text-gray-500">正在搜集素材（AI生成搜索词 → 多角度搜索 → 质量筛选）...</p>
      </div>
    </div>

    <!-- 素材结果 -->
    <div v-else-if="materials.length > 0" class="flex-1 min-h-0 overflow-auto space-y-4">
      <!-- 本地素材 -->
      <div v-if="localMaterials.length > 0">
        <div class="flex items-center gap-2 mb-2">
          <UIcon name="i-lucide:database" class="size-4 text-green-500" />
          <span class="text-xs font-medium text-gray-600 dark:text-gray-400">本地文章库 ({{ localMaterials.length }})</span>
        </div>
        <div class="space-y-2">
          <div v-for="m in localMaterials" :key="m.id" class="rounded-md border border-gray-200 dark:border-gray-700 p-3 bg-green-50/30 dark:bg-green-900/10">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ m.title }}</p>
            <p v-if="m.content" class="text-xs text-gray-500 mt-1 line-clamp-3">{{ m.content }}</p>
          </div>
        </div>
      </div>

      <!-- 网络素材 -->
      <div v-if="webMaterials.length > 0">
        <div class="flex items-center gap-2 mb-2">
          <UIcon name="i-lucide:globe" class="size-4 text-blue-500" />
          <span class="text-xs font-medium text-gray-600 dark:text-gray-400">网络搜索 ({{ webMaterials.length }})</span>
        </div>
        <div class="space-y-2">
          <div v-for="m in webMaterials" :key="m.id" class="rounded-md border border-gray-200 dark:border-gray-700 p-3 bg-blue-50/30 dark:bg-blue-900/10">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ m.title }}</p>
            <p v-if="m.content" class="text-xs text-gray-500 mt-1 line-clamp-3">{{ m.content }}</p>
            <a v-if="m.url" :href="m.url" target="_blank" class="text-[10px] text-blue-400 hover:underline mt-1 inline-block truncate max-w-full">{{ m.url }}</a>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="selectedTopicId && !gathering" class="flex-1 flex items-center justify-center">
      <div class="text-center text-gray-400">
        <UIcon name="i-lucide:search" class="size-16 mb-3 opacity-40" />
        <p class="text-lg">选择选题后点击"搜集素材"</p>
        <p class="text-sm mt-1">从本地文章库和网络搜索相关素材</p>
      </div>
    </div>
  </div>
</template>

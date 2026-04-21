<script setup lang="ts">
import toastFactory from '~/composables/toast';

interface AnalysisResult {
  title?: string;
  category: string;
  titleAnalysis: string;
  structureAnalysis: string;
  writingTechniques: string;
  reusableTemplate: string;
  viralElements: string;
  goldenSentences: string;
  summary: string;
}

interface AnalysisSection {
  key: keyof AnalysisResult;
  label: string;
  icon: string;
  color: string;
}

interface AnalysisRecord {
  id: number;
  url: string;
  title: string;
  category: string;
  summary: string;
  created_at: string;
}

const toast = toastFactory();

const inputUrl = ref('');
const analyzing = ref(false);
const result = ref<AnalysisResult | null>(null);
const error = ref('');

// 提示词
const promptVisible = ref(false);
const promptEditing = ref(false);
const promptText = ref('');
const promptDraft = ref('');
const promptSaving = ref(false);

// 历史记录
const records = ref<AnalysisRecord[]>([]);
const expandedId = ref<number | null>(null);
const expandedResult = ref<AnalysisResult | null>(null);

const sections: AnalysisSection[] = [
  { key: 'category', label: '文章分类', icon: 'i-lucide:tag', color: 'text-indigo-500' },
  { key: 'titleAnalysis', label: '标题分析', icon: 'i-lucide:heading', color: 'text-blue-500' },
  { key: 'structureAnalysis', label: '结构分析', icon: 'i-lucide:layout-list', color: 'text-purple-500' },
  { key: 'writingTechniques', label: '写作手法', icon: 'i-lucide:pen-tool', color: 'text-green-500' },
  { key: 'reusableTemplate', label: '可复用模板', icon: 'i-lucide:copy', color: 'text-orange-500' },
  { key: 'viralElements', label: '爆款要素', icon: 'i-lucide:flame', color: 'text-red-500' },
  { key: 'goldenSentences', label: '金句摘录', icon: 'i-lucide:sparkles', color: 'text-yellow-500' },
  { key: 'summary', label: '总结评价', icon: 'i-lucide:clipboard-check', color: 'text-teal-500' },
];

async function loadPrompt() {
  try {
    const resp = await $fetch<{ success: boolean; data?: string }>('/api/query/settings?key=analysis_prompt');
    if (resp.success && resp.data) {
      promptText.value = resp.data;
    }
  } catch {
    // 静默
  }
}

async function loadRecords() {
  try {
    const resp = await $fetch<{ success: boolean; data?: AnalysisRecord[] }>('/api/query/article/analysis-records');
    if (resp.success && resp.data) {
      records.value = resp.data;
    }
  } catch {
    // 静默
  }
}

onMounted(() => {
  loadPrompt();
  loadRecords();
});

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
      body: { key: 'analysis_prompt', value: promptDraft.value },
    });
    if (resp.success) {
      promptText.value = promptDraft.value;
      promptEditing.value = false;
      toast.success('保存成功', '提示词已更新');
    }
  } catch (err: any) {
    toast.error('保存失败', err?.message || '未知错误');
  } finally {
    promptSaving.value = false;
  }
}

async function analyze() {
  const url = inputUrl.value.trim();
  if (!url) {
    toast.error('输入错误', '请粘贴文章链接');
    return;
  }

  analyzing.value = true;
  result.value = null;
  error.value = '';
  expandedId.value = null;

  try {
    const resp = await $fetch<{
      success: boolean;
      data?: AnalysisResult;
      error?: string;
    }>('/api/query/article/analyze', {
      method: 'POST',
      body: { url },
    });

    if (resp.success && resp.data) {
      result.value = resp.data;
      await loadRecords();
    } else {
      error.value = resp.error || '解析失败';
      toast.error('解析失败', error.value);
    }
  } catch (err: any) {
    error.value = err?.message || '请求失败';
    toast.error('解析失败', error.value);
  } finally {
    analyzing.value = false;
  }
}

async function toggleExpand(record: AnalysisRecord) {
  if (expandedId.value === record.id) {
    expandedId.value = null;
    expandedResult.value = null;
    return;
  }

  expandedId.value = record.id;
  expandedResult.value = null;

  try {
    const resp = await $fetch<{ success: boolean; data?: any }>(`/api/query/article/analysis-records?id=${record.id}`);
    if (resp.success && resp.data) {
      expandedResult.value = resp.data;
    }
  } catch {
    toast.error('加载失败', '无法加载解析详情');
  }
}

function clearResult() {
  result.value = null;
  error.value = '';
  inputUrl.value = '';
}

function formatTime(createdAt: string) {
  if (!createdAt) return '--';
  const d = new Date(createdAt + 'Z');
  if (isNaN(d.getTime())) return createdAt;
  return d.toLocaleString('zh-CN', { hour12: false });
}

function fillUrl(url: string) {
  inputUrl.value = url;
  result.value = null;
  error.value = '';
  expandedId.value = null;
}
</script>

<template>
  <div class="flex flex-col h-full gap-4">
    <!-- 输入区 -->
    <div class="flex items-center gap-3">
      <UInput
        v-model="inputUrl"
        placeholder="粘贴微信公众号文章链接"
        icon="i-lucide:link"
        size="md"
        class="flex-1"
        :disabled="analyzing"
        @keydown.enter="analyze"
      />
      <UButton
        icon="i-lucide:sparkles"
        color="blue"
        :loading="analyzing"
        :disabled="analyzing || !inputUrl.trim()"
        @click="analyze"
      >
        {{ analyzing ? 'AI 分析中...' : '开始解析' }}
      </UButton>
      <UButton
        v-if="result || error"
        variant="ghost"
        color="gray"
        @click="clearResult"
      >
        清空
      </UButton>
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
          <span class="font-medium">分析提示词</span>
        </div>
        <div class="flex items-center gap-2">
          <UBadge v-if="promptText" color="green" variant="subtle" size="xs">已配置</UBadge>
          <UBadge v-else color="red" variant="subtle" size="xs">未配置</UBadge>
        </div>
      </div>
      <div v-if="promptVisible" class="p-3">
        <!-- 展示模式 -->
        <div v-if="!promptEditing">
          <pre class="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-auto bg-white dark:bg-gray-900 rounded p-3 border border-gray-100 dark:border-gray-700">{{ promptText || '暂无提示词' }}</pre>
          <div class="flex justify-end mt-2">
            <UButton icon="i-lucide:pencil" size="xs" variant="outline" @click="startEditPrompt">
              编辑提示词
            </UButton>
          </div>
        </div>
        <!-- 编辑模式 -->
        <div v-else class="space-y-2">
          <textarea
            v-model="promptDraft"
            class="w-full h-[200px] text-xs p-3 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
            placeholder="输入分析提示词..."
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

    <!-- 错误提示 -->
    <div v-if="error" class="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
      <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
        <UIcon name="i-lucide:alert-circle" class="size-5" />
        <span class="font-medium">解析失败</span>
      </div>
      <p class="mt-1 text-sm text-red-500 dark:text-red-300">{{ error }}</p>
    </div>

    <!-- 当前分析结果 -->
    <div v-if="result" class="space-y-4">
      <div v-if="result.title" class="text-base font-medium text-gray-800 dark:text-gray-200">
        {{ result.title }}
      </div>
      <div
        v-for="section in sections"
        :key="section.key"
        v-show="result[section.key]"
        class="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
      >
        <div class="flex items-center gap-2 mb-2">
          <UIcon :name="section.icon" :class="['size-4', section.color]" />
          <h4 class="font-medium text-sm">{{ section.label }}</h4>
        </div>
        <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
          {{ result[section.key] }}
        </div>
      </div>
    </div>

    <!-- 加载中 -->
    <div v-if="analyzing" class="flex items-center justify-center py-12">
      <div class="text-center">
        <UIcon name="i-lucide:brain" class="size-12 text-blue-500 animate-pulse mb-3" />
        <p class="text-gray-500">AI 正在深度分析文章内容...</p>
        <p class="text-xs text-gray-400 mt-1">分析标题、结构、写作手法、爆款要素等多维度内容</p>
      </div>
    </div>

    <!-- 解析历史 -->
    <div class="flex flex-col border-t border-gray-200 dark:border-gray-700 pt-3" style="height: 33vh; min-height: 180px;">
      <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 shrink-0">解析历史</h3>
      <div v-if="records.length > 0" class="flex-1 min-h-0 overflow-auto">
        <div
          v-for="record in records"
          :key="record.id"
          class="border border-gray-200 dark:border-gray-700 rounded-lg mb-2"
        >
          <div
            class="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
            @click="toggleExpand(record)"
          >
            <UIcon
              :name="expandedId === record.id ? 'i-lucide:chevron-down' : 'i-lucide:chevron-right'"
              class="size-4 text-gray-400 shrink-0"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium truncate">{{ record.title || '未知标题' }}</p>
                <UBadge v-if="record.category" color="indigo" variant="subtle" size="xs">{{ record.category }}</UBadge>
              </div>
              <p class="text-xs text-gray-400 truncate">{{ record.url }}</p>
            </div>
            <span class="text-xs text-gray-400 font-mono shrink-0">{{ formatTime(record.created_at) }}</span>
            <UButton
              icon="i-lucide:link"
              variant="ghost"
              color="gray"
              size="xs"
              title="使用此链接重新分析"
              @click.stop="fillUrl(record.url)"
            />
          </div>
          <div v-if="expandedId === record.id && expandedResult" class="border-t border-gray-100 dark:border-gray-800 px-3 py-3 space-y-3">
            <div
              v-for="section in sections"
              :key="section.key"
              v-show="expandedResult[section.key]"
              class="rounded-md bg-gray-50 dark:bg-gray-800/50 p-3"
            >
              <div class="flex items-center gap-2 mb-1">
                <UIcon :name="section.icon" :class="['size-3.5', section.color]" />
                <h4 class="font-medium text-xs">{{ section.label }}</h4>
              </div>
              <div class="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                {{ expandedResult[section.key] }}
              </div>
            </div>
          </div>
        </div>
      </div>
      <p v-else class="text-sm text-gray-400">暂无解析记录</p>
    </div>

    <!-- 空状态 -->
    <div v-if="!result && !analyzing && !error && records.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-center text-gray-400">
        <UIcon name="i-lucide:brain" class="size-16 mb-3 opacity-40" />
        <p class="text-lg">粘贴文章链接，AI 深度解析爆文密码</p>
        <p class="text-sm mt-1">标题分析 / 结构分析 / 写作手法 / 爆款要素 / 金句摘录</p>
      </div>
    </div>
  </div>
</template>

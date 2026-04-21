<script setup lang="ts">
import toastFactory from '~/composables/toast';

const toast = toastFactory();

interface ManagedAccount {
  id: number;
  name: string;
  category: string;
  persona: string;
  enabled: boolean;
}

interface DailyTopic {
  id: number;
  title: string;
  category: string;
  angle: string;
  viral_point: string;
}

interface GeneratedArticle {
  id: number;
  title: string;
  category: string;
  publish_status: string;
  created_at: string;
}

const accounts = ref<ManagedAccount[]>([]);
const selectedAccountId = ref<number | null>(null);
const topics = ref<DailyTopic[]>([]);
const selectedTopicId = ref<number | null>(null);
const generating = ref(false);
const article = ref('');
const selectedArticleId = ref<number | null>(null);
const articleList = ref<GeneratedArticle[]>([]);

// 参考风格
interface StyleOption {
  fakeid: string;
  account_name: string;
  article_count: number;
  overall_summary: string;
}
const styleOptions = ref<StyleOption[]>([]);
const selectedStyleFakeid = ref('');

// 提示词
const promptVisible = ref(false);
const promptEditing = ref(false);
const promptText = ref('');
const promptDraft = ref('');
const promptSaving = ref(false);

// 大纲（可选）
const outlineInput = ref('');

const PUBLISH_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'gray' },
  published: { label: '已推送', color: 'green' },
};

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

async function loadAccounts() {
  try {
    const resp = await $fetch<{ success: boolean; data?: ManagedAccount[] }>('/api/query/managed-accounts');
    if (resp.success && resp.data) {
      accounts.value = resp.data.filter(a => a.enabled);
    }
  } catch { /* 静默 */ }
}

async function loadTopics() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const resp = await $fetch<{ success: boolean; data?: { topics: DailyTopic[] } }>('/api/query/content/daily-topics', { params: { date: today } });
    if (resp.success && resp.data) {
      topics.value = resp.data.topics;
    }
  } catch { /* 静默 */ }
}

async function loadArticleList() {
  try {
    const resp = await $fetch<{ success: boolean; data?: any }>('/api/query/content/generated-articles', {
      params: { page: 1, pageSize: 50 },
    });
    if (resp.success) {
      articleList.value = Array.isArray(resp.data) ? resp.data : resp.data?.articles || [];
    }
  } catch { /* 静默 */ }
}

async function loadPrompt() {
  try {
    const resp = await $fetch<{ success: boolean; data?: string }>('/api/query/settings?key=draft_prompt');
    if (resp.success && resp.data) {
      promptText.value = resp.data;
    } else {
      promptText.value = getDefaultDraftPrompt();
    }
  } catch {
    promptText.value = getDefaultDraftPrompt();
  }
}

async function loadStyleOptions() {
  try {
    const resp = await $fetch<{ success: boolean; data?: StyleOption[] }>('/api/query/content/style-analysis');
    if (resp.success && resp.data) {
      styleOptions.value = Array.isArray(resp.data) ? resp.data : [];
    }
  } catch { /* 静默 */ }
}

function getDefaultDraftPrompt(): string {
  return `你是一位资深的微信公众号撰稿人。请根据给定的公众号人设、选题信息和参考素材，撰写一篇完整的公众号文章。

写作要求：
1. 符合公众号的人设定位和写作风格
2. 标题吸引眼球，开头能快速抓住读者
3. 内容有深度，论点清晰，素材丰富
4. 适当使用金句和修辞手法
5. 结尾要有升华和互动引导
6. 文章长度 1500-2500 字
7. 充分利用提供的素材，不要凭空编造
8. 输出正文必须严格按照 Markdown 格式，使用 ## 作为一级段落标题，### 作为二级段落标题，标题与正文之间空一行，确保层级结构清晰`;
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
      body: { key: 'draft_prompt', value: promptDraft.value },
    });
    if (resp.success) {
      promptText.value = promptDraft.value;
      promptEditing.value = false;
      toast.success('保存成功', '文章提示词已更新');
    }
  } catch (err: any) {
    toast.error('保存失败', err?.message || '未知错误');
  } finally {
    promptSaving.value = false;
  }
}

async function viewArticle(id: number) {
  try {
    const resp = await $fetch<{ success: boolean; data?: any }>(`/api/query/content/generated-article/${id}`);
    if (resp.success && resp.data) {
      article.value = resp.data.content || '';
      selectedArticleId.value = id;
      localStorage.setItem('content_gen_article_id', String(id));
    }
  } catch { /* 静默 */ }
}

async function deleteArticle(id: number) {
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>(`/api/query/content/generated-article/${id}`, { method: 'DELETE' });
    if (resp.success) {
      toast.success('已删除');
      if (selectedArticleId.value === id) {
        article.value = '';
        selectedArticleId.value = null;
      }
      await loadArticleList();
    } else {
      toast.error('删除失败', resp.error || '');
    }
  } catch {
    toast.error('删除失败');
  }
}

async function generateArticle() {
  if (!selectedAccountId.value) {
    toast.error('请选择', '请先选择一个运营公众号');
    return;
  }
  if (!selectedTopic.value) {
    toast.error('请选择', '请先选择一个选题');
    return;
  }

  generating.value = true;
  article.value = '';

  try {
    const resp = await $fetch<{ success: boolean; data?: string; articleId?: number; error?: string }>('/api/query/content/draft', {
      method: 'POST',
      body: {
        accountId: selectedAccountId.value,
        title: selectedTopic.value.title,
        topicId: selectedTopic.value.id,
        outline: outlineInput.value || undefined,
        styleFakeid: selectedStyleFakeid.value === 'none' ? '' : selectedStyleFakeid.value,
      },
    });

    if (resp.success && resp.data) {
      article.value = resp.data;
      if (resp.articleId) {
        selectedArticleId.value = resp.articleId;
        localStorage.setItem('content_gen_article_id', String(resp.articleId));
      }
      await loadArticleList();
    } else {
      toast.error('生成失败', resp.error || '未知错误');
    }
  } catch (err: any) {
    toast.error('生成失败', err?.message || '请求失败');
  } finally {
    generating.value = false;
  }
}

onMounted(() => {
  loadAccounts();
  loadTopics();
  loadArticleList();
  loadPrompt();
  loadStyleOptions();
});
</script>

<template>
  <div class="flex flex-col h-full gap-4">
    <!-- 上方：操作区（固定） -->
    <div class="shrink-0 space-y-3">
      <!-- 选择公众号 -->
      <div class="flex items-center gap-3">
        <select v-model="selectedAccountId" class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[180px]">
          <option :value="null" disabled>选择公众号</option>
          <option v-for="acc in accounts" :key="acc.id" :value="acc.id">{{ acc.name }}</option>
        </select>
      </div>

      <!-- 参考风格 -->
      <div v-if="styleOptions.length > 0" class="flex items-center gap-2">
        <span class="text-xs text-gray-400 shrink-0">参考风格：</span>
        <select v-model="selectedStyleFakeid" class="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">自动匹配（按分类）</option>
          <option value="none">不使用风格</option>
          <option v-for="s in styleOptions" :key="s.fakeid" :value="s.fakeid">{{ s.account_name }}</option>
        </select>
      </div>

      <!-- 选择选题 + 生成 -->
      <div class="flex items-center gap-3">
        <select v-model="selectedTopicId" class="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option :value="null" disabled>选择今日选题</option>
          <optgroup v-for="[cat, items] in groupedTopics" :key="cat" :label="cat">
            <option v-for="t in items" :key="t.id" :value="t.id">{{ t.title }}</option>
          </optgroup>
        </select>
        <UButton icon="i-lucide:sparkles" color="blue" :loading="generating" :disabled="generating || !selectedAccountId || !selectedTopicId" @click="generateArticle">
          {{ generating ? '生成中...' : '生成文章' }}
        </UButton>
      </div>

      <!-- 选题信息 -->
      <div v-if="selectedTopic" class="text-xs text-gray-500">
        <span class="text-gray-400">分类：</span><span class="text-blue-500">{{ selectedTopic.category }}</span>
        <span v-if="selectedTopic.angle" class="ml-3"><span class="text-gray-400">角度：</span>{{ selectedTopic.angle }}</span>
      </div>

      <!-- 大纲 + 提示词（折叠） -->
      <details class="rounded-md border border-gray-200 dark:border-gray-700">
        <summary class="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 cursor-pointer">附加大纲（可选）</summary>
        <textarea v-model="outlineInput" class="w-full px-3 py-2 text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 focus:outline-none resize-y min-h-[80px]" placeholder="可粘贴大纲，留空则直接根据选题和素材生成..." />
      </details>

      <div class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 cursor-pointer select-none" @click="promptVisible = !promptVisible">
          <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <UIcon :name="promptVisible ? 'i-lucide:chevron-down' : 'i-lucide:chevron-right'" class="size-4" />
            <UIcon name="i-lucide:message-square-text" class="size-4" />
            <span class="font-medium">文章提示词</span>
          </div>
        </div>
        <div v-if="promptVisible" class="p-3">
          <div v-if="!promptEditing">
            <pre class="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-auto bg-white dark:bg-gray-900 rounded p-3 border border-gray-100 dark:border-gray-700">{{ promptText }}</pre>
            <div class="flex justify-end mt-2">
              <UButton icon="i-lucide:pencil" size="xs" variant="outline" @click="startEditPrompt">编辑提示词</UButton>
            </div>
          </div>
          <div v-else class="space-y-2">
            <textarea v-model="promptDraft" class="w-full h-[200px] text-xs p-3 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y" placeholder="输入文章提示词..." />
            <div class="flex justify-end gap-2">
              <UButton size="xs" variant="ghost" color="gray" @click="cancelEditPrompt">取消</UButton>
              <UButton size="xs" color="blue" :loading="promptSaving" @click="savePrompt">保存</UButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 生成中 -->
    <div v-if="generating" class="flex-1 flex items-center justify-center min-h-0">
      <div class="text-center">
        <UIcon name="i-lucide:brain" class="size-12 text-blue-500 animate-pulse mb-3" />
        <p class="text-gray-500">AI 正在撰写文章...</p>
        <p class="text-xs text-gray-400 mt-1">根据选题、素材和写作风格生成完整文章</p>
      </div>
    </div>

    <!-- 文章内容展示 -->
    <div v-else-if="article" class="flex-1 min-h-0 overflow-auto">
      <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{{ article }}</div>
      </div>
    </div>

    <!-- 文章列表（无内容时显示） -->
    <div v-else class="flex-1 min-h-0 overflow-auto">
      <div v-if="articleList.length > 0" class="space-y-1.5">
        <div class="text-xs font-medium text-gray-500 mb-1">已生成文章 ({{ articleList.length }})</div>
        <div
          v-for="a in articleList"
          :key="a.id"
          class="flex items-center gap-3 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
          :class="selectedArticleId === a.id ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600' : ''"
        >
          <div class="flex-1 min-w-0" @click="viewArticle(a.id)">
            <p class="text-sm text-gray-700 dark:text-gray-300 truncate">{{ a.title }}</p>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-[10px] text-gray-400">{{ a.created_at?.substring(0, 16) }}</span>
              <span v-if="a.category" class="text-[10px] text-blue-400">{{ a.category }}</span>
              <UBadge :color="(PUBLISH_STATUS[a.publish_status] || PUBLISH_STATUS.draft).color" variant="subtle" size="xs">
                {{ (PUBLISH_STATUS[a.publish_status] || PUBLISH_STATUS.draft).label }}
              </UBadge>
            </div>
          </div>
          <button class="shrink-0 text-gray-300 hover:text-red-500 transition-colors" @click.stop="deleteArticle(a.id)">
            <UIcon name="i-lucide:trash-2" class="size-4" />
          </button>
        </div>
      </div>
      <div v-else class="flex items-center justify-center h-full">
        <div class="text-center text-gray-400">
          <UIcon name="i-lucide:file-pen" class="size-16 mb-3 opacity-40" />
          <p class="text-lg">选择公众号和选题，AI 生成文章</p>
          <p class="text-sm mt-1">基于选题、素材和写作风格直接生成完整文章</p>
        </div>
      </div>
    </div>
  </div>
</template>

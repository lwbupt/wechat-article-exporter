<script setup lang="ts">
import toastFactory from '~/composables/toast';

const toast = toastFactory();

interface TemplateItem {
  id: number;
  name: string;
  description: string;
  style_json: string;
  is_default: boolean;
}

interface ArticleOption {
  id: number;
  title: string;
  created_at: string;
}

const articles = ref<ArticleOption[]>([]);
const articleId = ref<number | null>(null);
const templates = ref<TemplateItem[]>([]);
const selectedTemplateId = ref<number | null>(null);
const contentText = ref('');
const previewHtml = ref('');
const formatting = ref(false);
const copied = ref(false);

// 排版结果元数据
const resultTitle = ref('');
const resultDigest = ref('');

// 暗黑模式预览
const darkPreview = ref(false);

function getTemplatePrimary(tpl: TemplateItem): string {
  try {
    const styles = JSON.parse(tpl.style_json);
    return styles?.colors?.primary || '#2563eb';
  } catch {
    return '#2563eb';
  }
}

function getTemplateBg(tpl: TemplateItem): string {
  try {
    const styles = JSON.parse(tpl.style_json);
    return styles?.colors?.background || '#ffffff';
  } catch {
    return '#ffffff';
  }
}

async function loadArticles() {
  try {
    const resp = await $fetch<{ success: boolean; data?: any }>('/api/query/content/generated-articles', {
      params: { page: 1, pageSize: 50 },
    });
    if (resp.success) {
      const list = Array.isArray(resp.data) ? resp.data : resp.data?.articles || [];
      articles.value = list;
    }
  } catch {
    // 静默
  }
}

async function loadTemplates() {
  try {
    const resp = await $fetch<{ success: boolean; data?: TemplateItem[] }>('/api/query/content/templates');
    if (resp.success && resp.data) {
      templates.value = resp.data;
      // 默认选中 is_default 模板
      const def = resp.data.find(t => t.is_default);
      if (def) selectedTemplateId.value = def.id;
    }
  } catch {
    // 静默
  }
}

async function loadArticleContent() {
  if (!articleId.value) return;
  try {
    const resp = await $fetch<{ success: boolean; data?: any }>(`/api/query/content/generated-article/${articleId.value}`);
    if (resp.success && resp.data) {
      contentText.value = resp.data.content_with_images || resp.data.content || '';
      previewHtml.value = resp.data.formatted_html || '';
    }
  } catch {
    // 静默
  }
}

async function formatArticle() {
  if (!articleId.value) {
    toast.error('请选择', '请先选择一篇文章');
    return;
  }
  if (!selectedTemplateId.value) {
    toast.error('请选择', '请先选择排版模板');
    return;
  }

  formatting.value = true;
  try {
    const resp = await $fetch<{
      success: boolean;
      data?: { html: string; templateName: string; title: string; digest: string };
      error?: string;
    }>('/api/query/content/format-article', {
      method: 'POST',
      body: {
        articleId: articleId.value,
        templateId: selectedTemplateId.value,
        content: contentText.value || undefined,
      },
    });
    if (resp.success && resp.data) {
      previewHtml.value = resp.data.html;
      resultTitle.value = resp.data.title || '';
      resultDigest.value = resp.data.digest || '';
      toast.success('排版完成', `已使用「${resp.data.templateName}」模板排版`);
    } else {
      toast.error('排版失败', resp.error || '未知错误');
    }
  } catch (err: any) {
    toast.error('排版失败', err?.message || '请求失败');
  } finally {
    formatting.value = false;
  }
}

async function copyHtml() {
  if (!previewHtml.value) {
    toast.error('无内容', '请先排版生成 HTML');
    return;
  }
  try {
    // 写入 text/html 格式，微信编辑器才能识别为富文本样式
    const htmlBlob = new Blob([previewHtml.value], { type: 'text/html' });
    const textBlob = new Blob([previewHtml.value], { type: 'text/plain' });
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })]);
    copied.value = true;
    toast.success('已复制', '排版样式已复制，可直接粘贴到微信编辑器');
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // 降级：尝试 writeText（纯文本，部分浏览器安全限制）
    try {
      await navigator.clipboard.writeText(previewHtml.value);
      toast.success('已复制（纯文本模式）', '粘贴到微信编辑器后可能需要手动调整样式');
    } catch {
      toast.error('复制失败', '请手动选择复制');
    }
  }
}

watch(articleId, () => {
  loadArticleContent();
});

onMounted(() => {
  const savedId = localStorage.getItem('content_gen_article_id');
  if (savedId) articleId.value = Number(savedId);
  loadArticles();
  loadTemplates();
});
</script>

<template>
  <div class="flex flex-col h-full gap-3">
    <!-- 顶部操作栏 -->
    <div class="flex items-center gap-3">
      <select
        v-model="articleId"
        class="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <option :value="null" disabled>选择文章</option>
        <option v-for="art in articles" :key="art.id" :value="art.id">{{ art.title }}</option>
      </select>
      <UButton
        icon="i-lucide:paintbrush"
        color="blue"
        :loading="formatting"
        :disabled="!articleId || !selectedTemplateId"
        @click="formatArticle"
      >
        {{ formatting ? '排版中...' : '排版' }}
      </UButton>
    </div>

    <!-- 模板选择 -->
    <div class="flex gap-2 overflow-x-auto pb-1">
      <div
        v-for="tpl in templates"
        :key="tpl.id"
        class="shrink-0 cursor-pointer rounded-md border-2 px-3 py-2 transition-colors min-w-[100px] text-center"
        :class="selectedTemplateId === tpl.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'"
        @click="selectedTemplateId = tpl.id"
      >
        <div class="flex items-center justify-center gap-1.5">
          <span
            class="inline-block w-3 h-3 rounded-full border border-gray-200"
            :style="{ backgroundColor: getTemplatePrimary(tpl) }"
          />
          <span
            class="text-sm font-medium"
            :class="selectedTemplateId === tpl.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'"
          >
            {{ tpl.name }}
          </span>
        </div>
        <div class="text-[10px] text-gray-400 mt-0.5">{{ tpl.description }}</div>
      </div>
    </div>

    <!-- 排版结果摘要 -->
    <div v-if="resultTitle || resultDigest" class="shrink-0 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 space-y-1">
      <div v-if="resultTitle" class="text-sm font-medium text-gray-700 dark:text-gray-300">
        <span class="text-gray-400 text-xs mr-1">标题</span>{{ resultTitle }}
      </div>
      <div v-if="resultDigest" class="text-xs text-gray-500">
        <span class="text-gray-400 mr-1">摘要</span>{{ resultDigest }}
      </div>
    </div>

    <!-- 主内容区：左右分栏 -->
    <div class="flex-1 min-h-0 flex gap-3">
      <!-- 左侧：Markdown 编辑 -->
      <div class="flex-1 flex flex-col min-w-0">
        <div class="text-xs font-medium text-gray-500 mb-1">Markdown 内容（可编辑）</div>
        <textarea
          v-model="contentText"
          class="flex-1 min-h-0 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none font-mono"
          placeholder="文章内容..."
        />
      </div>

      <!-- 右侧：HTML 预览 -->
      <div class="flex-1 flex flex-col min-w-0">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-gray-500">预览</span>
            <button
              v-if="previewHtml"
              class="text-[10px] px-1.5 py-0.5 rounded border transition-colors"
              :class="darkPreview ? 'border-gray-600 bg-gray-800 text-gray-300' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'"
              @click="darkPreview = !darkPreview"
            >
              {{ darkPreview ? '深色' : '浅色' }}模式
            </button>
          </div>
          <UButton
            v-if="previewHtml"
            :icon="copied ? 'i-lucide:check' : 'i-lucide:copy'"
            size="xs"
            variant="outline"
            @click="copyHtml"
          >
            {{ copied ? '已复制' : '复制 HTML' }}
          </UButton>
        </div>
        <div
          class="flex-1 min-h-0 rounded-md border border-gray-200 dark:border-gray-700 overflow-auto"
          :style="darkPreview ? { backgroundColor: '#0f172a' } : { backgroundColor: '#ffffff' }"
        >
          <div v-if="previewHtml" class="p-2" v-html="previewHtml" />
          <div v-else class="flex items-center justify-center h-full text-gray-400 text-sm">
            选择模板后点击「排版」预览效果
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import toastFactory from '~/composables/toast';

const toast = toastFactory();

interface SavedImage {
  id: number;
  original_url: string;
  hosted_url: string;
  thumbnail_url: string;
  alt_text: string;
  source: string;
  sort_order: number;
}

interface ArticleOption {
  id: number;
  title: string;
  category: string;
  created_at: string;
}

const articles = ref<ArticleOption[]>([]);
const articleId = ref<number | null>(null);
const savedImages = ref<SavedImage[]>([]);
const previewContent = ref('');

// 一键配图
const autoImaging = ref(false);
const autoImageResult = ref<{ imageCount: number; keywords: string[] } | null>(null);

// 配图配置
const imageConfig = ref({ mode: 'search', count: 2, source: 'free_search' });

const selectedArticle = computed(() => {
  return articles.value.find(a => a.id === articleId.value);
});

const sourceLabel = computed(() => {
  const s = imageConfig.value.source;
  if (s === 'paid_search') return '付费搜索 (Serper)';
  if (s === 'ai_generate') return 'AI 生图';
  return '免费搜索 (Pexels)';
});

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

async function loadSavedImages() {
  if (!articleId.value) return;
  try {
    const resp = await $fetch<{ success: boolean; data?: SavedImage[] }>('/api/query/content/article-images', {
      params: { articleId: articleId.value },
    });
    if (resp.success && resp.data) {
      savedImages.value = resp.data;
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
      previewContent.value = resp.data.content_with_images || resp.data.content || '';
    }
  } catch {
    // 静默
  }
}

async function loadImageConfig() {
  if (!selectedArticle.value) return;
  const category = selectedArticle.value.category;
  if (!category) {
    imageConfig.value = { mode: 'search', count: 2, source: 'free_search' };
    return;
  }
  try {
    const resp = await $fetch<{ success: boolean; data?: any }>('/api/query/settings/category-image-config', {
      params: { category },
    });
    if (resp.success && resp.data) {
      imageConfig.value = {
        mode: resp.data.image_mode || 'search',
        count: resp.data.image_count || 2,
        source: resp.data.image_source || 'free_search',
      };
    }
  } catch {
    imageConfig.value = { mode: 'search', count: 2, source: 'free_search' };
  }
}

async function autoImage() {
  if (!articleId.value) {
    toast.error('请选择', '请先选择一篇文章');
    return;
  }

  autoImaging.value = true;
  autoImageResult.value = null;
  try {
    const resp = await $fetch<{
      success: boolean;
      data?: { contentWithImages: string; imageCount: number; keywords: string[] };
      error?: string;
    }>('/api/query/content/auto-images', {
      method: 'POST',
      body: { articleId: articleId.value },
    });

    if (resp.success && resp.data) {
      autoImageResult.value = { imageCount: resp.data.imageCount, keywords: resp.data.keywords || [] };
      previewContent.value = resp.data.contentWithImages;
      toast.success('配图完成', `已自动添加 ${resp.data.imageCount} 张配图`);
      await loadSavedImages();
    } else {
      toast.error('配图失败', resp.error || '未知错误');
    }
  } catch (err: any) {
    toast.error('配图失败', err?.message || '请求失败');
  } finally {
    autoImaging.value = false;
  }
}

watch(articleId, () => {
  autoImageResult.value = null;
  loadSavedImages();
  loadArticleContent();
  loadImageConfig();
});

onMounted(async () => {
  const savedId = localStorage.getItem('content_gen_article_id');
  await loadArticles();
  if (savedId) {
    articleId.value = Number(savedId);
  }
});
</script>

<template>
  <div class="flex flex-col h-full gap-4">
    <!-- 文章选择 -->
    <select
      v-model="articleId"
      class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
    >
      <option :value="null" disabled>选择已生成的文章</option>
      <option v-for="art in articles" :key="art.id" :value="art.id">{{ art.title }}</option>
    </select>

    <!-- 配图配置 + 操作 -->
    <div v-if="articleId" class="space-y-3">
      <!-- 分类配图配置 -->
      <div class="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
        <span>配图方式：<span class="text-blue-500 font-medium">{{ imageConfig.mode === 'search' ? '搜索匹配' : imageConfig.mode === 'ai_generate' ? 'AI生图' : '不配图' }}</span></span>
        <span>数量：<span class="text-blue-500 font-medium">{{ imageConfig.count }} 张</span></span>
        <span>搜索源：<span class="text-green-500 font-medium">{{ sourceLabel }}</span></span>
        <span v-if="selectedArticle?.category" class="text-gray-400">（{{ selectedArticle.category }}）</span>
      </div>

      <!-- 一键配图按钮 -->
      <UButton
        icon="i-lucide:wand-sparkles"
        color="blue"
        size="md"
        block
        :loading="autoImaging"
        :disabled="autoImaging || imageConfig.mode === 'none'"
        @click="autoImage"
      >
        {{ autoImaging ? '自动配图中（AI提取搜索词 → 搜图 → 智能插入）...' : '一键自动配图' }}
      </UButton>

      <!-- 配图结果 -->
      <div v-if="autoImageResult" class="rounded-md border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10 p-3">
        <div class="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
          <UIcon name="i-lucide:check-circle" class="size-4" />
          <span class="font-medium">配图完成：{{ autoImageResult.imageCount }} 张</span>
        </div>
        <div v-if="autoImageResult.keywords.length > 0" class="mt-1 text-xs text-gray-500">
          搜索词：{{ autoImageResult.keywords.join('、') }}
        </div>
      </div>
    </div>

    <!-- 一键配图中 -->
    <div v-if="autoImaging" class="flex items-center justify-center py-12">
      <div class="text-center">
        <UIcon name="i-lucide:wand-sparkles" class="size-12 text-blue-500 animate-pulse mb-3" />
        <p class="text-gray-500">正在自动配图...</p>
      </div>
    </div>

    <!-- 已配图展示 -->
    <div v-if="savedImages.length > 0 && !autoImaging" class="space-y-2">
      <div class="text-xs font-medium text-gray-500">已配图 ({{ savedImages.length }}张)</div>
      <div class="flex gap-2 flex-wrap">
        <div
          v-for="img in savedImages"
          :key="img.id"
          class="relative rounded-md overflow-hidden border border-gray-200 dark:border-gray-700"
        >
          <img :src="img.thumbnail_url || img.hosted_url || img.original_url" class="size-16 object-cover" loading="lazy" />
          <UBadge v-if="img.source" color="gray" variant="subtle" size="xs" class="absolute bottom-0.5 left-0.5">{{ img.source }}</UBadge>
        </div>
      </div>
    </div>

    <!-- 配图后 Markdown 预览 -->
    <div v-if="previewContent && !autoImaging" class="flex-1 min-h-0">
      <details open class="h-full rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
        <summary class="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 cursor-pointer bg-gray-50 dark:bg-gray-800 shrink-0">
          配图后 Markdown 预览
        </summary>
        <pre class="flex-1 overflow-auto px-3 py-2 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed max-h-[300px]">{{ previewContent }}</pre>
      </details>
    </div>

    <!-- 空状态 -->
    <div v-if="!articleId && articles.length > 0" class="flex-1 flex items-center justify-center">
      <div class="text-center text-gray-400">
        <UIcon name="i-lucide:image" class="size-16 mb-3 opacity-40" />
        <p class="text-lg">选择文章开始配图</p>
        <p class="text-sm mt-1">一键自动配图，按分类配置搜索源</p>
      </div>
    </div>
  </div>
</template>

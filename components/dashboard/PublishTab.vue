<script setup lang="ts">
import toastFactory from '~/composables/toast';

const toast = toastFactory();

interface ArticleOption {
  id: number;
  title: string;
  formatted_html: string | null;
  layout_template: string | null;
  publish_status: string;
  created_at: string;
}

interface AccountOption {
  id: number;
  name: string;
  appid: string;
  secret: string;
  enabled: boolean;
}

const articles = ref<ArticleOption[]>([]);
const accounts = ref<AccountOption[]>([]);
const articleId = ref<number | null>(null);
const accountId = ref<number | null>(null);
const selectedArticle = ref<ArticleOption | null>(null);
const coverImageUrl = ref('');

const tokenStatus = ref<'unknown' | 'valid' | 'error'>('unknown');
const tokenMessage = ref('');
const checking = ref(false);
const pushing = ref(false);
const pushResult = ref<{ mediaId: string } | null>(null);

async function loadArticles() {
  try {
    const resp = await $fetch<{ success: boolean; data?: any }>('/api/query/content/generated-articles', {
      params: { page: 1, pageSize: 50 },
    });
    if (resp.success) {
      articles.value = Array.isArray(resp.data) ? resp.data : resp.data?.articles || [];
    }
  } catch {
    // 静默
  }
}

async function loadAccounts() {
  try {
    const resp = await $fetch<{ success: boolean; data?: AccountOption[] }>('/api/query/managed-accounts');
    if (resp.success && resp.data) {
      // 只显示有 appid 的账号
      accounts.value = resp.data.filter(a => a.enabled && a.appid);
    }
  } catch {
    // 静默
  }
}

async function loadCoverImage() {
  if (!articleId.value) return;
  try {
    const resp = await $fetch<{ success: boolean; data?: any[] }>('/api/query/content/article-images', {
      params: { articleId: articleId.value },
    });
    if (resp.success && resp.data) {
      const cover = resp.data.find((img: any) => img.position === 'cover');
      coverImageUrl.value = cover?.hosted_url || cover?.original_url || '';
    }
  } catch {
    // 静默
  }
}

async function checkToken() {
  if (!accountId.value) {
    toast.error('请选择', '请先选择公众号');
    return;
  }
  checking.value = true;
  tokenStatus.value = 'unknown';
  try {
    const resp = await $fetch<{
      success: boolean;
      data?: { accessToken: string; expiresIn: number; cached: boolean };
      error?: string;
    }>('/api/query/content/wechat-token', { params: { accountId: accountId.value } });
    if (resp.success) {
      tokenStatus.value = 'valid';
      tokenMessage.value = `连接成功（${resp.data?.cached ? '缓存' : '新获取'}，${Math.floor((resp.data?.expiresIn || 0) / 60)} 分钟内有效）`;
    } else {
      tokenStatus.value = 'error';
      tokenMessage.value = resp.error || '连接失败';
    }
  } catch (err: any) {
    tokenStatus.value = 'error';
    tokenMessage.value = err?.message || '连接失败';
  } finally {
    checking.value = false;
  }
}

async function pushDraft() {
  if (!articleId.value) {
    toast.error('请选择', '请先选择文章');
    return;
  }
  if (!accountId.value) {
    toast.error('请选择', '请先选择公众号');
    return;
  }
  pushing.value = true;
  pushResult.value = null;
  try {
    const resp = await $fetch<{ success: boolean; data?: { mediaId: string }; error?: string }>(
      '/api/query/content/push-draft',
      {
        method: 'POST',
        body: { articleId: articleId.value, accountId: accountId.value },
      },
    );
    if (resp.success && resp.data) {
      pushResult.value = resp.data;
      toast.success('推送成功', '已推送到公众号草稿箱');
      // 更新本地状态
      if (selectedArticle.value) {
        selectedArticle.value.publish_status = 'pushed';
      }
    } else {
      toast.error('推送失败', resp.error || '未知错误');
    }
  } catch (err: any) {
    toast.error('推送失败', err?.message || '请求失败');
  } finally {
    pushing.value = false;
  }
}

watch(articleId, (val) => {
  selectedArticle.value = articles.value.find(a => a.id === val) || null;
  pushResult.value = null;
  loadCoverImage();
});

onMounted(() => {
  const savedId = localStorage.getItem('content_gen_article_id');
  if (savedId) articleId.value = Number(savedId);
  loadArticles();
  loadAccounts();
});
</script>

<template>
  <div class="flex flex-col h-full gap-4">
    <!-- 选择区 -->
    <div class="flex items-center gap-3">
      <select
        v-model="articleId"
        class="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <option :value="null" disabled>选择文章</option>
        <option v-for="art in articles" :key="art.id" :value="art.id">{{ art.title }}</option>
      </select>
      <select
        v-model="accountId"
        class="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <option :value="null" disabled>选择公众号</option>
        <option v-for="acc in accounts" :key="acc.id" :value="acc.id">{{ acc.name }}</option>
      </select>
    </div>

    <!-- 无账号提示 -->
    <div v-if="accounts.length === 0" class="rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 text-sm text-yellow-700 dark:text-yellow-300">
      暂无可用公众号。请在「公众号运营」中配置 AppID 和 Secret。
    </div>

    <!-- 文章摘要 -->
    <div v-if="selectedArticle" class="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
      <div class="flex items-center gap-2">
        <span class="font-medium text-base">{{ selectedArticle.title }}</span>
        <UBadge
          :color="selectedArticle.publish_status === 'pushed' ? 'green' : selectedArticle.publish_status === 'published' ? 'blue' : 'gray'"
          variant="subtle"
          size="xs"
        >
          {{ selectedArticle.publish_status === 'pushed' ? '已推送' : selectedArticle.publish_status === 'published' ? '已发布' : '草稿' }}
        </UBadge>
      </div>
      <div class="flex items-center gap-4 text-xs text-gray-500">
        <span v-if="coverImageUrl">
          封面：<img :src="coverImageUrl" class="inline size-10 object-cover rounded" />
        </span>
        <span v-else>封面：未设置</span>
        <span v-if="selectedArticle.layout_template">排版：{{ selectedArticle.layout_template }}</span>
        <span v-else>排版：未排版</span>
      </div>
      <div v-if="!selectedArticle.formatted_html" class="text-xs text-orange-500">
        该文章尚未排版，建议先在「排版」页签完成排版再发布
      </div>
    </div>

    <!-- 操作区 -->
    <div class="flex items-center gap-3">
      <UButton
        icon="i-lucide:wifi"
        variant="outline"
        :loading="checking"
        :disabled="!accountId"
        @click="checkToken"
      >
        检查连接
      </UButton>
      <UButton
        icon="i-lucide:send"
        color="blue"
        :loading="pushing"
        :disabled="!articleId || !accountId"
        @click="pushDraft"
      >
        {{ pushing ? '推送中...' : '推送到草稿箱' }}
      </UButton>
    </div>

    <!-- 连接状态 -->
    <div v-if="tokenStatus !== 'unknown'" class="text-xs">
      <div v-if="tokenStatus === 'valid'" class="text-green-600">
        <UIcon name="i-lucide:check-circle" class="size-3 inline mr-1" />
        {{ tokenMessage }}
      </div>
      <div v-else class="text-red-500">
        <UIcon name="i-lucide:alert-circle" class="size-3 inline mr-1" />
        {{ tokenMessage }}
      </div>
    </div>

    <!-- 推送结果 -->
    <div v-if="pushResult" class="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 space-y-1">
      <div class="text-sm font-medium text-green-700 dark:text-green-300">
        <UIcon name="i-lucide:check-circle" class="size-4 inline mr-1" />
        已成功推送到公众号草稿箱
      </div>
      <div class="text-xs text-green-600 dark:text-green-400">media_id: {{ pushResult.mediaId }}</div>
      <div class="text-xs text-green-600 dark:text-green-400">
        请在微信公众平台后台确认并发布
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!articleId && articles.length > 0" class="flex-1 flex items-center justify-center">
      <div class="text-center text-gray-400">
        <UIcon name="i-lucide:send" class="size-16 mb-3 opacity-40" />
        <p class="text-lg">选择文章和公众号，推送到草稿箱</p>
        <p class="text-sm mt-1">需要公众号已配置 AppID 和 Secret</p>
      </div>
    </div>
  </div>
</template>

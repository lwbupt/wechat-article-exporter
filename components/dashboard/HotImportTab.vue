<script setup lang="ts">
import toastFactory from '~/composables/toast';

interface PreviewRow {
  publishDate: string;
  accountName: string;
  title: string;
  url: string;
  readNum: number;
  likeNum: number;
  hotScore: number;
  isFavorited: boolean;
}

interface ImportRecord {
  id: number;
  file_name: string;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  details: string;
  created_at: string;
}

const toast = toastFactory();

// 文件 & 预览
const fileRef = ref<HTMLInputElement | null>(null);
const previewRows = ref<PreviewRow[]>([]);
const parsing = ref(false);

// 导入进度
const importedCount = ref(0);
const skippedCount = ref(0);
const failedCount = ref(0);
const importDone = ref(false);

// 转换进度
const resolving = ref(false);
const resolveTotal = ref(0);
const resolvedCount = ref(0);
const resolveFailedCount = ref(0);
const resolveDone = ref(false);

// 导入历史
const importRecords = ref<ImportRecord[]>([]);

async function loadRecords() {
  try {
    const resp = await $fetch<{ success: boolean; data?: ImportRecord[] }>('/api/query/import-records');
    if (resp.success && resp.data) {
      importRecords.value = resp.data;
    }
  } catch {
    // 静默
  }
}

onMounted(() => {
  loadRecords();
});

async function handleFileChange(evt: Event) {
  const files = (evt.target as HTMLInputElement).files;
  if (!files || files.length === 0) return;

  parsing.value = true;
  previewRows.value = [];
  resetImportState();

  try {
    const file = files[0];
    const formData = new FormData();
    formData.append('file', file);

    const resp = await $fetch<{
      success: boolean;
      data?: {
        preview: PreviewRow[];
        total: number;
        imported: number;
        skipped: number;
        failed: number;
      };
      error?: string;
    }>('/api/query/article/hot-import', {
      method: 'POST',
      body: formData,
    });

    if (resp.success && resp.data) {
      previewRows.value = resp.data.preview;
      importedCount.value = resp.data.imported;
      skippedCount.value = resp.data.skipped;
      failedCount.value = resp.data.failed;
      importDone.value = true;

      toast.success(
        '导入完成',
        `成功 ${resp.data.imported} 篇，跳过 ${resp.data.skipped} 篇，失败 ${resp.data.failed} 篇`
      );

      await loadRecords();
    } else {
      toast.error('导入失败', resp.error || '未知错误');
    }
  } catch (error: any) {
    toast.error('导入失败', error?.message || '未知错误');
  } finally {
    parsing.value = false;
  }
}

function resetImportState() {
  importedCount.value = 0;
  skippedCount.value = 0;
  failedCount.value = 0;
  importDone.value = false;
  resolveDone.value = false;
  resolvedCount.value = 0;
  resolveFailedCount.value = 0;
}

async function startResolve() {
  const longUrlArticles = previewRows.value.filter(row => {
    try {
      const parsed = new URL(row.url);
      return parsed.pathname === '/s' && parsed.searchParams.has('__biz');
    } catch {
      return false;
    }
  });

  if (longUrlArticles.length === 0) {
    toast.info('提示', '没有需要转换的长链接');
    return;
  }

  resolving.value = true;
  resolveTotal.value = longUrlArticles.length;
  resolvedCount.value = 0;
  resolveFailedCount.value = 0;
  resolveDone.value = false;

  try {
    const articles = longUrlArticles.map(row => {
      const parsed = new URL(row.url);
      return {
        fakeid: parsed.searchParams.get('__biz') || '',
        aid: `${Number(parsed.searchParams.get('mid'))}_${Number(parsed.searchParams.get('idx')) || 1}`,
        link: row.url,
      };
    }).filter(a => a.fakeid);

    const resp = await $fetch<{
      success: boolean;
      data?: { resolved: number; failed: number };
      error?: string;
    }>('/api/query/article/batch-resolve', {
      method: 'POST',
      body: { articles },
    });

    if (resp.success && resp.data) {
      resolvedCount.value = resp.data.resolved;
      resolveFailedCount.value = resp.data.failed;
    }

    resolveDone.value = true;
    toast.success('转换完成', `成功 ${resolvedCount.value} 篇，失败 ${resolveFailedCount.value} 篇`);
  } catch (error: any) {
    toast.error('转换失败', error?.message || '未知错误');
  } finally {
    resolving.value = false;
  }
}

function selectFile() {
  fileRef.value?.click();
}

function clearPreview() {
  previewRows.value = [];
  resetImportState();
  if (fileRef.value) fileRef.value.value = '';
}

function formatTime(createdAt: string) {
  if (!createdAt) return '--';
  const d = new Date(createdAt + 'Z');
  if (isNaN(d.getTime())) return createdAt;
  return d.toLocaleString('zh-CN', { hour12: false });
}
</script>

<template>
  <div class="flex flex-col h-full gap-4">
    <!-- 操作区 -->
    <div class="flex items-center gap-3">
      <input
        ref="fileRef"
        type="file"
        accept=".xls,.xlsx"
        class="hidden"
        @change="handleFileChange"
      />
      <UButton icon="i-lucide:file-spreadsheet" color="blue" :loading="parsing" @click="selectFile">
        {{ parsing ? '解析导入中...' : '选择 Excel 并导入' }}
      </UButton>
      <UButton
        v-if="importDone && importedCount > 0"
        color="orange"
        :loading="resolving"
        :disabled="resolving"
        @click="startResolve"
      >
        批量转换为短链接
      </UButton>
      <UButton
        v-if="previewRows.length > 0"
        variant="ghost"
        color="gray"
        @click="clearPreview"
      >
        清空
      </UButton>
    </div>

    <!-- 导入结果 -->
    <div v-if="importDone" class="flex gap-4 text-sm">
      <span class="text-green-600 dark:text-green-400">成功 {{ importedCount }}</span>
      <span class="text-yellow-600 dark:text-yellow-400">跳过 {{ skippedCount }}</span>
      <span class="text-red-600 dark:text-red-400">失败 {{ failedCount }}</span>
      <span class="text-gray-400">共 {{ previewRows.length }} 篇</span>
    </div>

    <!-- 转换进度 -->
    <div v-if="resolving || resolveDone" class="space-y-2">
      <div class="flex items-center justify-between text-sm">
        <span class="text-gray-600 dark:text-gray-400">
          {{ resolving ? '正在转换短链接（遍历微信文章列表，较慢）...' : '转换完成' }}
        </span>
      </div>
      <UProgress v-if="resolving" animation="carousel" color="orange" size="md" />
      <div v-if="resolveDone" class="flex gap-4 text-sm">
        <span class="text-green-600 dark:text-green-400">转换成功 {{ resolvedCount }}</span>
        <span class="text-red-600 dark:text-red-400">转换失败 {{ resolveFailedCount }}</span>
      </div>
    </div>

    <!-- 预览表格 -->
    <div v-if="previewRows.length > 0" class="flex-1 min-h-0 overflow-auto rounded border border-gray-200 dark:border-gray-700">
      <table class="w-full text-sm">
        <thead class="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
          <tr>
            <th class="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400 w-8">#</th>
            <th class="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">标题</th>
            <th class="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400 w-32">公众号</th>
            <th class="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400 w-20">阅读</th>
            <th class="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400 w-20">点赞</th>
            <th class="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400 w-20">指数</th>
            <th class="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400 w-24">日期</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, idx) in previewRows"
            :key="idx"
            class="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            <td class="px-3 py-1.5 text-gray-400">{{ idx + 1 }}</td>
            <td class="px-3 py-1.5 max-w-[300px] truncate" :title="row.title">{{ row.title }}</td>
            <td class="px-3 py-1.5 text-gray-500 truncate">{{ row.accountName }}</td>
            <td class="px-3 py-1.5 text-right font-mono">{{ row.readNum.toLocaleString() }}</td>
            <td class="px-3 py-1.5 text-right font-mono">{{ row.likeNum }}</td>
            <td class="px-3 py-1.5 text-right font-mono">{{ row.hotScore }}</td>
            <td class="px-3 py-1.5 text-gray-500">{{ row.publishDate }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 导入历史 -->
    <div class="flex flex-col border-t border-gray-200 dark:border-gray-700 pt-3" style="height: 33vh; min-height: 180px;">
      <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 shrink-0">导入历史</h3>
      <div v-if="importRecords.length > 0" class="flex-1 min-h-0 overflow-auto rounded border border-gray-200 dark:border-gray-700">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
            <tr>
              <th class="px-3 py-1.5 text-left font-medium text-gray-500 w-40">时间</th>
              <th class="px-3 py-1.5 text-left font-medium text-gray-500">文件名</th>
              <th class="px-3 py-1.5 text-right font-medium text-gray-500 w-16">总数</th>
              <th class="px-3 py-1.5 text-right font-medium text-gray-500 w-16">成功</th>
              <th class="px-3 py-1.5 text-right font-medium text-gray-500 w-16">跳过</th>
              <th class="px-3 py-1.5 text-right font-medium text-gray-500 w-16">失败</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="record in importRecords"
              :key="record.id"
              class="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <td class="px-3 py-1.5 text-gray-500 font-mono text-xs">{{ formatTime(record.created_at) }}</td>
              <td class="px-3 py-1.5 truncate max-w-[200px]" :title="record.file_name">{{ record.file_name }}</td>
              <td class="px-3 py-1.5 text-right font-mono">{{ record.total }}</td>
              <td class="px-3 py-1.5 text-right font-mono text-green-600">{{ record.imported }}</td>
              <td class="px-3 py-1.5 text-right font-mono text-yellow-600">{{ record.skipped }}</td>
              <td class="px-3 py-1.5 text-right font-mono text-red-600">{{ record.failed }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-sm text-gray-400">暂无导入记录</p>
    </div>

    <!-- 空状态 -->
    <div v-if="previewRows.length === 0 && !parsing && importRecords.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-center text-gray-400">
        <UIcon name="i-lucide:file-spreadsheet" class="size-16 mb-3 opacity-40" />
        <p class="text-lg">选择 Excel 文件开始导入</p>
        <p class="text-sm mt-1">支持 .xls / .xlsx 格式的爆文列表</p>
      </div>
    </div>
  </div>
</template>

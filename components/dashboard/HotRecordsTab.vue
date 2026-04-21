<script setup lang="ts">
import toastFactory from '~/composables/toast';

interface AnalysisRecord {
  id: number;
  url: string;
  title: string;
  category: string;
  summary: string;
  created_at: string;
}

interface CategoryItem {
  id: number;
  name: string;
  parent_id: number | null;
  children?: CategoryItem[];
}

const toast = toastFactory();

const records = ref<AnalysisRecord[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const totalPages = ref(0);
const loading = ref(false);

// 展开详情
const expandedId = ref<number | null>(null);
const expandedDetail = ref<any>(null);
const detailLoading = ref(false);

// 分类列表
const categories = ref<CategoryItem[]>([]);

// 分类编辑
const editingId = ref<number | null>(null);
const editingCategory = ref('');
const saving = ref(false);

async function loadRecords() {
  loading.value = true;
  try {
    const resp = await $fetch<{
      success: boolean;
      data?: { records: AnalysisRecord[]; total: number; page: number; pageSize: number; totalPages: number };
    }>('/api/query/article/analysis-list', {
      params: { page: page.value, pageSize: pageSize.value },
    });
    if (resp.success && resp.data) {
      records.value = resp.data.records;
      total.value = resp.data.total;
      totalPages.value = resp.data.totalPages;
    }
  } catch {
    toast.error('加载失败', '无法加载解析记录');
  } finally {
    loading.value = false;
  }
}

async function loadCategories() {
  try {
    const resp = await $fetch<{ success: boolean; data?: CategoryItem[] }>('/api/query/categories');
    if (resp.success && resp.data) {
      categories.value = resp.data;
    }
  } catch {
    // 静默
  }
}

async function toggleExpand(record: AnalysisRecord) {
  if (expandedId.value === record.id) {
    expandedId.value = null;
    expandedDetail.value = null;
    return;
  }

  expandedId.value = record.id;
  expandedDetail.value = null;
  detailLoading.value = true;

  try {
    const resp = await $fetch<{ success: boolean; data?: any }>(`/api/query/article/analysis-records?id=${record.id}`);
    if (resp.success && resp.data) {
      expandedDetail.value = resp.data;
    }
  } catch {
    toast.error('加载失败', '无法加载详情');
  } finally {
    detailLoading.value = false;
  }
}

function startEditCategory(record: AnalysisRecord) {
  editingId.value = record.id;
  editingCategory.value = record.category || '';
}

function cancelEdit() {
  editingId.value = null;
}

async function saveCategory(record: AnalysisRecord) {
  saving.value = true;
  try {
    const resp = await $fetch<{ success: boolean }>('/api/query/article/analysis-category', {
      method: 'PUT',
      body: { id: record.id, category: editingCategory.value },
    });
    if (resp.success) {
      record.category = editingCategory.value;
      editingId.value = null;
      toast.success('保存成功', '分类已更新');
    }
  } catch (err: any) {
    toast.error('保存失败', err?.message || '未知错误');
  } finally {
    saving.value = false;
  }
}

function goToPage(p: number) {
  if (p < 1 || p > totalPages.value) return;
  page.value = p;
  expandedId.value = null;
  loadRecords();
}

function formatTime(createdAt: string) {
  if (!createdAt) return '--';
  const d = new Date(createdAt + 'Z');
  if (isNaN(d.getTime())) return createdAt;
  return d.toLocaleString('zh-CN', { hour12: false });
}

const pageNumbers = computed(() => {
  const pages: number[] = [];
  const start = Math.max(1, page.value - 2);
  const end = Math.min(totalPages.value, page.value + 2);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  return pages;
});

// 分析维度
const detailSections = [
  { key: 'title_analysis', label: '标题分析', icon: 'i-lucide:heading', color: 'text-blue-500' },
  { key: 'structure_analysis', label: '结构分析', icon: 'i-lucide:layout-list', color: 'text-purple-500' },
  { key: 'writing_techniques', label: '写作手法', icon: 'i-lucide:pen-tool', color: 'text-green-500' },
  { key: 'reusable_template', label: '可复用模板', icon: 'i-lucide:copy', color: 'text-orange-500' },
  { key: 'viral_elements', label: '爆款要素', icon: 'i-lucide:flame', color: 'text-red-500' },
  { key: 'golden_sentences', label: '金句摘录', icon: 'i-lucide:sparkles', color: 'text-yellow-500' },
  { key: 'summary', label: '总结评价', icon: 'i-lucide:clipboard-check', color: 'text-teal-500' },
];

onMounted(() => {
  loadRecords();
  loadCategories();
});
</script>

<template>
  <div class="flex flex-col h-full gap-4">
    <!-- 统计 -->
    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-500">共 {{ total }} 条解析记录</span>
    </div>

    <!-- 记录列表 -->
    <div class="flex-1 min-h-0 overflow-auto">
      <div v-if="loading" class="flex items-center justify-center py-12">
        <UIcon name="i-lucide:loader-2" class="size-8 text-gray-400 animate-spin" />
      </div>

      <div v-else-if="records.length === 0" class="flex items-center justify-center py-12 text-gray-400">
        <div class="text-center">
          <UIcon name="i-lucide:inbox" class="size-12 mb-2 opacity-40" />
          <p>暂无解析记录</p>
        </div>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="record in records"
          :key="record.id"
          class="border border-gray-200 dark:border-gray-700 rounded-lg"
        >
          <!-- 主行 -->
          <div
            class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
            @click="toggleExpand(record)"
          >
            <UIcon
              :name="expandedId === record.id ? 'i-lucide:chevron-down' : 'i-lucide:chevron-right'"
              class="size-4 text-gray-400 shrink-0"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium truncate">{{ record.title || '未知标题' }}</p>
                <!-- 分类：可编辑 -->
                <template v-if="editingId === record.id">
                  <select
                    v-model="editingCategory"
                    class="text-xs px-2 py-0.5 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:outline-none"
                    @click.stop
                  >
                    <option value="">未分类</option>
                    <optgroup v-for="cat in categories" :key="cat.id" :label="cat.name">
                      <option :value="cat.name">{{ cat.name }}</option>
                      <option
                        v-for="sub in cat.children || []"
                        :key="sub.id"
                        :value="sub.name"
                      >
                        {{ sub.name }}
                      </option>
                    </optgroup>
                  </select>
                  <UButton size="2xs" color="blue" :loading="saving" @click.stop="saveCategory(record)">保存</UButton>
                  <UButton size="2xs" variant="ghost" color="gray" @click.stop="cancelEdit">取消</UButton>
                </template>
                <template v-else>
                  <UBadge v-if="record.category" color="indigo" variant="subtle" size="xs">{{ record.category }}</UBadge>
                  <span v-else class="text-xs text-gray-400 cursor-pointer hover:text-blue-500" @click.stop="startEditCategory(record)">
                    + 分类
                  </span>
                  <UButton
                    icon="i-lucide:pencil"
                    variant="ghost"
                    color="gray"
                    size="2xs"
                    title="编辑分类"
                    @click.stop="startEditCategory(record)"
                  />
                </template>
              </div>
              <p class="text-xs text-gray-400 truncate mt-0.5">{{ record.url }}</p>
            </div>
            <span class="text-xs text-gray-400 font-mono shrink-0">{{ formatTime(record.created_at) }}</span>
          </div>

          <!-- 展开详情 -->
          <div v-if="expandedId === record.id" class="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
            <div v-if="detailLoading" class="flex justify-center py-4">
              <UIcon name="i-lucide:loader-2" class="size-5 text-gray-400 animate-spin" />
            </div>
            <div v-else-if="expandedDetail" class="space-y-3">
              <div
                v-for="section in detailSections"
                :key="section.key"
                v-show="expandedDetail[section.key]"
                class="rounded-md bg-gray-50 dark:bg-gray-800/50 p-3"
              >
                <div class="flex items-center gap-2 mb-1">
                  <UIcon :name="section.icon" :class="['size-3.5', section.color]" />
                  <h4 class="font-medium text-xs">{{ section.label }}</h4>
                </div>
                <div class="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {{ expandedDetail[section.key] }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-1 shrink-0 pt-2 border-t border-gray-200 dark:border-gray-700">
      <UButton
        variant="ghost"
        color="gray"
        size="xs"
        icon="i-lucide:chevrons-left"
        :disabled="page <= 1"
        @click="goToPage(1)"
      />
      <UButton
        variant="ghost"
        color="gray"
        size="xs"
        icon="i-lucide:chevron-left"
        :disabled="page <= 1"
        @click="goToPage(page - 1)"
      />
      <UButton
        v-for="p in pageNumbers"
        :key="p"
        :variant="p === page ? 'solid' : 'ghost'"
        :color="p === page ? 'blue' : 'gray'"
        size="xs"
        class="min-w-[28px]"
        @click="goToPage(p)"
      >
        {{ p }}
      </UButton>
      <UButton
        variant="ghost"
        color="gray"
        size="xs"
        icon="i-lucide:chevron-right"
        :disabled="page >= totalPages"
        @click="goToPage(page + 1)"
      />
      <UButton
        variant="ghost"
        color="gray"
        size="xs"
        icon="i-lucide:chevrons-right"
        :disabled="page >= totalPages"
        @click="goToPage(totalPages)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import toastFactory from '~/composables/toast';
import { websiteName } from '~/config';

useHead({
  title: `公众号运营 | ${websiteName}`,
});

interface ManagedAccount {
  id: number;
  name: string;
  appid: string;
  secret: string;
  description: string;
  category: string;
  persona: string;
  enabled: boolean;
  ext1: string;
  ext2: string;
  writing_style_id: number | null;
  layout_template_id: number | null;
  daily_publish_count: number;
  publish_time: string;
  auto_publish: boolean;
  image_mode: string;
  image_count: number;
  image_source: string;
  image_config: string;
  header_content: string;
  footer_content: string;
  section_prefix: string;
  section_suffix: string;
  created_at: string;
  updated_at: string;
}

interface StyleOption {
  id: number;
  account_name: string;
}

interface TemplateOption {
  id: number;
  name: string;
  is_default: boolean;
}

interface CategoryItem {
  id: number;
  name: string;
  parent_id: number | null;
  children?: CategoryItem[];
}

const toast = toastFactory();

const accounts = ref<ManagedAccount[]>([]);
const categories = ref<CategoryItem[]>([]);
const styleOptions = ref<StyleOption[]>([]);
const templateOptions = ref<TemplateOption[]>([]);
const loading = ref(false);

// 编辑弹窗
const showEditModal = ref(false);
const editingAccount = ref<Partial<ManagedAccount>>({});
const isCreate = ref(true);
const saving = ref(false);

// secret 仅写入，不回显

async function loadAccounts() {
  loading.value = true;
  try {
    const resp = await $fetch<{ success: boolean; data?: ManagedAccount[] }>('/api/query/managed-accounts');
    if (resp.success && resp.data) {
      accounts.value = resp.data;
    }
  } catch {
    toast.error('加载失败', '无法加载公众号列表');
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

async function loadStyleOptions() {
  try {
    const resp = await $fetch<{ success: boolean; data?: StyleOption[] }>('/api/query/content/style-analysis');
    if (resp.success && resp.data) styleOptions.value = resp.data;
  } catch { /* 静默 */ }
}

async function loadTemplateOptions() {
  try {
    const resp = await $fetch<{ success: boolean; data?: TemplateOption[] }>('/api/query/content/templates');
    if (resp.success && resp.data) templateOptions.value = resp.data;
  } catch { /* 静默 */ }
}

onMounted(() => {
  loadAccounts();
  loadCategories();
  loadStyleOptions();
  loadTemplateOptions();
});

function openCreate() {
  isCreate.value = true;
  editingAccount.value = {
    name: '', appid: '', secret: '', description: '', category: '', persona: '',
    enabled: false, ext1: '', ext2: '',
    writing_style_id: null, layout_template_id: null, daily_publish_count: 1, publish_time: '08:00', auto_publish: false,
    image_mode: '', image_count: 0, image_source: '', image_config: '',
    header_content: '', footer_content: '', section_prefix: '', section_suffix: '',
  };
  showEditModal.value = true;
}

function openEdit(record: ManagedAccount) {
  isCreate.value = false;
  editingAccount.value = { ...record, secret: '' };
  showEditModal.value = true;
}

async function saveAccount() {
  const data = editingAccount.value;
  if (!data.name?.trim()) {
    toast.error('保存失败', '公众号名称不能为空');
    return;
  }

  saving.value = true;
  try {
    if (isCreate.value) {
      const resp = await $fetch<{ success: boolean; error?: string }>('/api/query/managed-accounts', {
        method: 'POST',
        body: data,
      });
      if (!resp.success) {
        toast.error('创建失败', resp.error || '未知错误');
        return;
      }
      toast.success('创建成功', `已添加 ${data.name}`);
    } else {
      const resp = await $fetch<{ success: boolean; error?: string }>('/api/query/managed-accounts', {
        method: 'PUT',
        body: data,
      });
      if (!resp.success) {
        toast.error('更新失败', resp.error || '未知错误');
        return;
      }
      toast.success('更新成功', `已保存 ${data.name}`);
    }
    showEditModal.value = false;
    await loadAccounts();
  } catch (err: any) {
    toast.error('保存失败', err?.message || '未知错误');
  } finally {
    saving.value = false;
  }
}

async function deleteAccount(record: ManagedAccount) {
  try {
    const resp = await $fetch<{ success: boolean }>('/api/query/managed-accounts', {
      method: 'DELETE',
      body: { id: record.id },
    });
    if (resp.success) {
      toast.success('删除成功', `已删除 ${record.name}`);
      await loadAccounts();
    }
  } catch (err: any) {
    toast.error('删除失败', err?.message || '未知错误');
  }
}

async function toggleEnabled(record: ManagedAccount) {
  try {
    const resp = await $fetch<{ success: boolean }>('/api/query/managed-accounts', {
      method: 'PUT',
      body: { ...record, enabled: !record.enabled },
    });
    if (resp.success) {
      record.enabled = !record.enabled;
    }
  } catch {
    toast.error('操作失败', '无法切换运营状态');
  }
}

function maskSecret(val: string) {
  if (!val) return '-';
  return '****';
}

function formatTime(val: string) {
  if (!val) return '--';
  const d = new Date(val + 'Z');
  if (isNaN(d.getTime())) return val;
  return d.toLocaleString('zh-CN', { hour12: false });
}
</script>

<template>
  <div class="h-full">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">公众号运营</h1>
    </Teleport>

    <div class="h-full overflow-auto px-4 py-4">
      <!-- 操作栏 -->
      <div class="flex items-center justify-between mb-4">
        <span class="text-sm text-gray-500">共 {{ accounts.length }} 个运营公众号</span>
        <UButton icon="i-lucide:plus" color="blue" @click="openCreate">新增公众号</UButton>
      </div>

      <!-- 列表 -->
      <div v-if="loading" class="flex justify-center py-12">
        <UIcon name="i-lucide:loader-2" class="size-8 text-gray-400 animate-spin" />
      </div>

      <div v-else-if="accounts.length === 0" class="flex items-center justify-center py-12 text-gray-400">
        <div class="text-center">
          <UIcon name="i-lucide:bot" class="size-12 mb-2 opacity-40" />
          <p>暂无运营公众号</p>
          <p class="text-sm mt-1">点击上方「新增公众号」添加</p>
        </div>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="record in accounts"
          :key="record.id"
          class="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
        >
          <div class="flex items-start justify-between gap-4">
            <!-- 左侧信息 -->
            <div class="flex-1 min-w-0 space-y-2">
              <div class="flex items-center gap-2">
                <span class="font-medium text-base">{{ record.name }}</span>
                <UBadge v-if="record.category" color="indigo" variant="subtle" size="xs">{{ record.category }}</UBadge>
                <UBadge :color="record.enabled ? 'green' : 'gray'" variant="subtle" size="xs">
                  {{ record.enabled ? '运营中' : '未启用' }}
                </UBadge>
              </div>

              <div v-if="record.description" class="text-sm text-gray-500">{{ record.description }}</div>

              <div class="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
                <span v-if="record.appid">AppID: <span class="font-mono text-gray-600 dark:text-gray-300">{{ record.appid }}</span></span>
                <span v-if="record.persona" class="text-gray-500">人设: {{ record.persona }}</span>
                <span v-if="record.ext1" class="text-gray-500">受众: {{ record.ext1 }}</span>
                <span v-if="record.auto_publish" class="text-blue-500">
                  <UIcon name="i-lucide:clock" class="size-3 mr-0.5" />自动 {{ record.publish_time }} × {{ record.daily_publish_count || 1 }}篇
                </span>
              </div>

              <div class="text-xs text-gray-400">
                创建: {{ formatTime(record.created_at) }}
                <span v-if="record.updated_at !== record.created_at" class="ml-3">更新: {{ formatTime(record.updated_at) }}</span>
              </div>
            </div>

            <!-- 右侧操作 -->
            <div class="flex items-center gap-2 shrink-0">
              <UToggle
                :model-value="record.enabled"
                @update:model-value="toggleEnabled(record)"
              />
              <UButton icon="i-lucide:pencil" variant="ghost" color="gray" size="xs" @click="openEdit(record)">编辑</UButton>
              <UButton icon="i-lucide:trash-2" variant="ghost" color="red" size="xs" @click="deleteAccount(record)">删除</UButton>
            </div>
          </div>
        </div>
      </div>

      <div class="h-[5vh]"></div>
    </div>

    <!-- 编辑弹窗 -->
    <UModal v-model="showEditModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">{{ isCreate ? '新增运营公众号' : '编辑运营公众号' }}</h3>
        </template>

        <div class="space-y-4">
          <UFormGroup label="公众号名称" required>
            <UInput v-model="editingAccount.name" placeholder="输入公众号名称" />
          </UFormGroup>

          <UFormGroup label="AppID">
            <UInput v-model="editingAccount.appid" placeholder="微信公众平台 AppID" />
          </UFormGroup>

          <UFormGroup label="Secret">
            <UInput v-model="editingAccount.secret" type="password" :placeholder="isCreate ? '输入 Secret' : '留空则不修改'" />
          </UFormGroup>

          <UFormGroup label="公众号说明">
            <UTextarea v-model="editingAccount.description" placeholder="公众号简介或说明" :rows="2" />
          </UFormGroup>

          <UFormGroup label="分类">
            <select
              v-model="editingAccount.category"
              class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">未分类</option>
              <optgroup v-for="cat in categories" :key="cat.id" :label="cat.name">
                <option :value="cat.name">{{ cat.name }}</option>
                <option v-for="sub in cat.children || []" :key="sub.id" :value="sub.name">{{ sub.name }}</option>
              </optgroup>
            </select>
          </UFormGroup>

          <UFormGroup label="公众号人设">
            <UTextarea v-model="editingAccount.persona" placeholder="公众号的人设定位、目标受众、写作风格等" :rows="3" />
          </UFormGroup>

          <UFormGroup label="公众号受众">
            <UInput v-model="editingAccount.ext1" placeholder="如：25-35岁职场女性" />
          </UFormGroup>

          <UFormGroup label="预留字段2">
            <UInput v-model="editingAccount.ext2" placeholder="可选" />
          </UFormGroup>

          <!-- 内容生成配置 -->
          <div class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <h4 class="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">内容生成配置</h4>
            <div class="space-y-4">
              <UFormGroup label="写作风格">
                <select
                  v-model="editingAccount.writing_style_id"
                  class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option :value="null">未选择</option>
                  <option v-for="s in styleOptions" :key="s.id" :value="s.id">{{ s.account_name }}</option>
                </select>
              </UFormGroup>

              <UFormGroup label="排版模板">
                <select
                  v-model="editingAccount.layout_template_id"
                  class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option :value="null">未选择</option>
                  <option v-for="t in templateOptions" :key="t.id" :value="t.id">{{ t.name }}{{ t.is_default ? ' (默认)' : '' }}</option>
                </select>
              </UFormGroup>

              <div class="flex gap-4">
                <UFormGroup label="每日推送数量" class="flex-1">
                  <UInput v-model.number="editingAccount.daily_publish_count" type="number" :min="1" :max="8" placeholder="1" />
                </UFormGroup>
                <UFormGroup label="推送时间" class="flex-1">
                  <input
                    v-model="editingAccount.publish_time"
                    type="time"
                    class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </UFormGroup>
              </div>

              <UFormGroup label="自动发布">
                <div class="flex items-center gap-2">
                  <UToggle v-model="editingAccount.auto_publish" />
                  <span class="text-xs text-gray-400">{{ editingAccount.auto_publish ? '启用自动发布' : '手动触发' }}</span>
                </div>
              </UFormGroup>
            </div>
          </div>

          <!-- 配图策略覆盖 -->
          <div class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-sm font-semibold text-gray-600 dark:text-gray-300">配图策略覆盖</h4>
              <span class="text-xs text-gray-400">留空则使用分类默认配置</span>
            </div>
            <div class="space-y-4">
              <UFormGroup label="配图模式">
                <select
                  v-model="editingAccount.image_mode"
                  class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">跟随分类默认</option>
                  <option value="search">搜索配图</option>
                  <option value="none">不配图</option>
                </select>
              </UFormGroup>

              <div v-if="editingAccount.image_mode === 'search'" class="flex gap-4">
                <UFormGroup label="配图数量" class="flex-1">
                  <UInput v-model.number="editingAccount.image_count" type="number" :min="1" :max="8" placeholder="2" />
                </UFormGroup>
                <UFormGroup label="图片来源" class="flex-1">
                  <select
                    v-model="editingAccount.image_source"
                    class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="">跟随分类默认</option>
                    <option value="free_search">免费搜索</option>
                    <option value="pexels">Pexels</option>
                    <option value="unsplash">Unsplash</option>
                  </select>
                </UFormGroup>
              </div>
            </div>
          </div>

          <!-- 个性化固定内容 -->
          <div class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-sm font-semibold text-gray-600 dark:text-gray-300">个性化固定内容</h4>
              <span class="text-xs text-gray-400">排版时自动插入文章首尾</span>
            </div>
            <div class="space-y-4">
              <UFormGroup label="文首内容">
                <UTextarea v-model="editingAccount.header_content" placeholder='<section style="...">作者介绍、日期等</section>' :rows="3" />
                <template #hint><span class="text-xs text-gray-400">HTML 格式，插入到文章正文最前面</span></template>
              </UFormGroup>
              <UFormGroup label="文尾内容">
                <UTextarea v-model="editingAccount.footer_content" placeholder='<section style="...">点赞·收藏·转发引导</section>' :rows="3" />
                <template #hint><span class="text-xs text-gray-400">HTML 格式，插入到文章正文最后面</span></template>
              </UFormGroup>
              <div class="flex gap-4">
                <UFormGroup label="章节前内容" class="flex-1">
                  <UTextarea v-model="editingAccount.section_prefix" placeholder="每个二级标题前插入的 HTML" :rows="2" />
                </UFormGroup>
                <UFormGroup label="章节后内容" class="flex-1">
                  <UTextarea v-model="editingAccount.section_suffix" placeholder="每个二级标题后插入的 HTML" :rows="2" />
                </UFormGroup>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="gray" @click="showEditModal = false">取消</UButton>
            <UButton color="blue" :loading="saving" @click="saveAccount">保存</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

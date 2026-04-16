<script setup lang="ts">
interface CategoryItem {
  id: number;
  name: string;
  parent_id: number | null;
  sort_order: number;
  image_mode?: string;
  image_count?: number;
  image_source?: string;
  created_at?: string;
  children?: CategoryItem[];
}

const categories = ref<CategoryItem[]>([]);
const loading = ref(true);
const editingId = ref<number | null>(null);
const editName = ref('');
const editImageMode = ref('search');
const editImageCount = ref(2);
const editImageSource = ref('free_search');
const addingToParentId = ref<number | null>(null);
const addName = ref('');
const deleteTarget = ref<CategoryItem | null>(null);
const showDeleteModal = ref(false);

const showEditModal = ref(false);
const showAddChildModal = ref(false);

async function loadCategories() {
  loading.value = true;
  try {
    const resp = await $fetch<{ success: boolean; data: CategoryItem[] }>('/api/query/categories');
    if (resp?.success) {
      categories.value = resp.data;
    }
  } catch (error) {
    console.error('Failed to load categories:', error);
  } finally {
    loading.value = false;
  }
}

async function handleAdd(parentId: number | null = null) {
  addingToParentId.value = parentId;
  addName.value = '';
  showAddChildModal.value = true;
}

async function confirmAdd() {
  if (!addName.value.trim()) return;
  try {
    await $fetch('/api/query/categories', {
      method: 'POST',
      body: { name: addName.value.trim(), parentId: addingToParentId.value },
    });
    await loadCategories();
    showAddChildModal.value = false;
    addName.value = '';
  } catch (error) {
    console.error('Failed to add category:', error);
  }
}

function startEdit(item: CategoryItem) {
  editingId.value = item.id;
  editName.value = item.name;
  editImageMode.value = item.image_mode || 'search';
  editImageCount.value = item.image_count || 2;
  editImageSource.value = item.image_source || 'free_search';
  showEditModal.value = true;
}

async function confirmEdit() {
  if (!editName.value.trim() || !editingId.value) return;
  try {
    await $fetch(`/api/query/categories/${editingId.value}`, {
      method: 'PUT',
      body: {
        name: editName.value.trim(),
        imageMode: editImageMode.value,
        imageCount: editImageCount.value,
        imageSource: editImageSource.value,
      },
    });
    await loadCategories();
    showEditModal.value = false;
    editingId.value = null;
    editName.value = '';
  } catch (error) {
    console.error('Failed to update category:', error);
  }
}

function startDelete(item: CategoryItem) {
  deleteTarget.value = item;
  showDeleteModal.value = true;
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  try {
    await $fetch(`/api/query/categories/${deleteTarget.value.id}`, {
      method: 'DELETE',
    });
    await loadCategories();
    showDeleteModal.value = false;
    deleteTarget.value = null;
  } catch (error) {
    console.error('Failed to delete category:', error);
  }
}

function imageConfigLabel(item: CategoryItem) {
  if (item.image_mode === 'none') return '不配图';
  if (item.image_mode === 'ai_generate') return 'AI生图';
  const count = item.image_count || 2;
  const source = item.image_source === 'paid_search' ? '付费搜索' : item.image_source === 'ai_generate' ? 'AI生图' : '免费搜索';
  return `${count}张·${source}`;
}

onMounted(() => {
  loadCategories();
});
</script>

<template>
  <div class="flex flex-col h-full gap-3 overflow-hidden">
    <!-- 操作栏 -->
    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-500">共 {{ categories.length }} 个一级分类</span>
      <UButton icon="i-lucide:plus" size="sm" @click="handleAdd(null)">添加一级分类</UButton>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="flex items-center justify-center py-8 text-gray-400">
      <UIcon name="i-lucide:loader-2" class="size-5 animate-spin mr-2" />加载中...
    </div>

    <div v-else-if="categories.length === 0" class="py-8 text-center text-gray-400 text-sm">暂无分类，请先添加</div>

    <!-- 分类列表 -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto flex flex-col rounded-lg border border-gray-200 dark:border-gray-700">
      <div v-for="(parent, pIdx) in categories" :key="parent.id" :class="pIdx > 0 ? 'border-t border-gray-100 dark:border-gray-700' : ''">
        <!-- 一级分类 -->
        <div class="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800">
          <UIcon name="i-lucide:folder" class="size-4 text-blue-500" />
          <span class="flex-1 font-medium text-sm">{{ parent.name }}</span>
          <span class="text-xs text-gray-400 mr-1">{{ imageConfigLabel(parent) }}</span>
          <span class="text-xs text-gray-400 mr-2">{{ parent.children?.length || 0 }}个子</span>
          <div class="flex items-center gap-1">
            <UButton icon="i-lucide:plus" variant="ghost" size="2xs" @click="handleAdd(parent.id)" />
            <UButton icon="i-lucide:pencil" variant="ghost" size="2xs" @click="startEdit(parent)" />
            <UButton icon="i-lucide:trash-2" variant="ghost" size="2xs" color="red" @click="startDelete(parent)" />
          </div>
        </div>

        <!-- 二级分类列表 -->
        <div v-if="parent.children && parent.children.length > 0" class="ml-4">
          <div
            v-for="child in parent.children"
            :key="child.id"
            class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 group"
          >
            <UIcon name="i-lucide:tag" class="size-3.5 text-gray-400" />
            <span class="flex-1 text-sm text-gray-700 dark:text-gray-300">{{ child.name }}</span>
            <span class="text-xs text-gray-400 mr-1">{{ imageConfigLabel(child) }}</span>
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <UButton icon="i-lucide:pencil" variant="ghost" size="2xs" @click="startEdit(child)" />
              <UButton icon="i-lucide:trash-2" variant="ghost" size="2xs" color="red" @click="startDelete(child)" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加分类弹窗 -->
    <UModal v-model="showAddChildModal">
      <UCard>
        <template #header>
          <span class="font-semibold">{{ addingToParentId ? '添加二级分类' : '添加一级分类' }}</span>
        </template>
        <UInput v-model="addName" placeholder="请输入分类名称" @keyup.enter="confirmAdd" />
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="white" @click="showAddChildModal = false">取消</UButton>
            <UButton color="primary" :disabled="!addName.trim()" @click="confirmAdd">确定</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 编辑分类弹窗 -->
    <UModal v-model="showEditModal">
      <UCard>
        <template #header>
          <span class="font-semibold">编辑分类</span>
        </template>
        <div class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">分类名称</label>
            <UInput v-model="editName" placeholder="请输入分类名称" @keyup.enter="confirmEdit" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">配图方式</label>
            <select
              v-model="editImageMode"
              class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="search">搜索匹配图</option>
              <option value="ai_generate">AI 生图（预留）</option>
              <option value="none">不配图</option>
            </select>
          </div>
          <div v-if="editImageMode === 'search'">
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">配图数量</label>
            <input
              v-model.number="editImageCount"
              type="number"
              min="1"
              max="6"
              class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <p class="text-xs text-gray-400 mt-1">标题后正文前1张 + 中间标题前 N-1 张（1-6）</p>
          </div>
          <div v-if="editImageMode === 'search'">
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">搜索源</label>
            <select
              v-model="editImageSource"
              class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="free_search">免费搜索（Pexels 素材库，推荐生活/情感类）</option>
              <option value="paid_search">付费搜索（Serper.dev Google搜图，推荐时政/科技类）</option>
            </select>
            <p class="text-xs text-gray-400 mt-1">免费搜索=Pexels，付费搜索=Serper.dev(Google搜图)</p>
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="white" @click="showEditModal = false">取消</UButton>
            <UButton color="primary" :disabled="!editName.trim()" @click="confirmEdit">确定</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 删除确认弹窗 -->
    <UModal v-model="showDeleteModal">
      <UCard>
        <template #header>
          <span class="font-semibold">确认删除</span>
        </template>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          确定要删除分类「<strong>{{ deleteTarget?.name }}</strong>」吗？
          <span v-if="deleteTarget?.children?.length" class="block text-orange-500">
            该分类下有 {{ deleteTarget.children.length }} 个子分类，将一并删除
          </span>
        </p>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="white" @click="showDeleteModal = false">取消</UButton>
            <UButton color="red" @click="confirmDelete">删除</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

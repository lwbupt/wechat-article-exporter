<script setup lang="ts">
import { websiteName } from '~/config';

useHead({
  title: `分类管理 | ${websiteName}`,
});

interface CategoryItem {
  id: number;
  name: string;
  parent_id: number | null;
  sort_order: number;
  created_at?: string;
  children?: CategoryItem[];
}

const categories = ref<CategoryItem[]>([]);
const loading = ref(true);
const editingId = ref<number | null>(null);
const editName = ref('');
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
  if (parentId !== null) {
    addingToParentId.value = parentId;
    addName.value = '';
    showAddChildModal.value = true;
  } else {
    addName.value = '';
    showAddChildModal.value = true;
  }
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
  showEditModal.value = true;
}

async function confirmEdit() {
  if (!editName.value.trim() || !editingId.value) return;
  try {
    await $fetch(`/api/query/categories/${editingId.value}`, {
      method: 'PUT',
      body: { name: editName.value.trim() },
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

onMounted(() => {
  loadCategories();
});
</script>

<template>
  <div class="h-full">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">分类管理</h1>
    </Teleport>

    <div class="h-full overflow-auto">
      <UCard class="mx-4 mt-4">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-semibold">分类列表</h3>
            <UButton icon="i-lucide:plus" size="sm" @click="handleAdd(null)">添加一级分类</UButton>
          </div>
        </template>

        <div v-if="loading" class="flex items-center justify-center py-8 text-gray-400">
          <Icon name="i-lucide:loader-2" class="size-5 animate-spin mr-2" />加载中...
        </div>

        <div v-else-if="categories.length === 0" class="py-8 text-center text-gray-400 text-sm">暂无分类，请先添加</div>

        <div v-else class="flex flex-col">
          <div v-for="parent in categories" :key="parent.id" class="border-b border-gray-100 last:border-b-0">
            <!-- 一级分类 -->
            <div class="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
              <UIcon name="i-lucide:folder" class="size-4 text-blue-500" />
              <span class="flex-1 font-medium text-sm">{{ parent.name }}</span>
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
                class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <UIcon name="i-lucide:tag" class="size-3.5 text-gray-400" />
                <span class="flex-1 text-sm text-gray-700 dark:text-gray-300">{{ child.name }}</span>
                <div class="flex items-center gap-1 opacity-0 hover:opacity-100">
                  <UButton icon="i-lucide:pencil" variant="ghost" size="2xs" @click="startEdit(child)" />
                  <UButton icon="i-lucide:trash-2" variant="ghost" size="2xs" color="red" @click="startDelete(child)" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </UCard>
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
        <UInput v-model="editName" placeholder="请输入分类名称" @keyup.enter="confirmEdit" />
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

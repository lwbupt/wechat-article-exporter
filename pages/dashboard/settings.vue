<script setup lang="ts">
import { websiteName } from '~/config';

useHead({
  title: `设置 | ${websiteName}`,
});

const activeTab = ref('settings');
</script>

<template>
  <div class="h-full">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">设置</h1>
    </Teleport>

    <div class="flex flex-col h-full px-3 py-3">
      <!-- 页签切换 -->
      <div class="flex border-b border-gray-200 dark:border-gray-700 mb-4">
        <button
          class="px-4 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'settings' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = 'settings'"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide:settings" class="size-4" />
            基本设置
          </span>
          <div v-if="activeTab === 'settings'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'model' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = 'model'"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide:brain" class="size-4" />
            模型配置
          </span>
          <div v-if="activeTab === 'model'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'category' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = 'category'"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide:folder-tree" class="size-4" />
            分类管理
          </span>
          <div v-if="activeTab === 'category'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'proxy' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = 'proxy'"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide:globe" class="size-4" />
            公共代理
          </span>
          <div v-if="activeTab === 'proxy'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
        </button>
      </div>

      <!-- 页签内容 -->
      <div class="flex-1 min-h-0 overflow-auto">
        <DashboardSettingsTab v-if="activeTab === 'settings'" />
        <DashboardModelConfigTab v-if="activeTab === 'model'" />
        <DashboardCategoryTab v-if="activeTab === 'category'" />
        <DashboardProxyTab v-if="activeTab === 'proxy'" />
      </div>
    </div>
  </div>
</template>

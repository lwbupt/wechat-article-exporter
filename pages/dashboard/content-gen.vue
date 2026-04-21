<script setup lang="ts">
import { websiteName } from '~/config';

useHead({
  title: `内容生成 | ${websiteName}`,
});

const activeTab = ref('topic');
</script>

<template>
  <div class="h-full">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">内容生成</h1>
    </Teleport>

    <div class="flex flex-col h-full px-3 py-3">
      <!-- 页签切换 -->
      <div class="flex border-b border-gray-200 dark:border-gray-700 mb-4">
        <button
          class="px-4 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'topic' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = 'topic'"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide:lightbulb" class="size-4" />
            选题生成
          </span>
          <div v-if="activeTab === 'topic'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'material' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = 'material'"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide:search" class="size-4" />
            素材搜集
          </span>
          <div v-if="activeTab === 'material'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'draft' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = 'draft'"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide:file-pen" class="size-4" />
            文章生成
          </span>
          <div v-if="activeTab === 'draft'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'image' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = 'image'"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide:image" class="size-4" />
            配图
          </span>
          <div v-if="activeTab === 'image'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'layout' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = 'layout'"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide:palette" class="size-4" />
            排版
          </span>
          <div v-if="activeTab === 'layout'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'publish' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = 'publish'"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide:send" class="size-4" />
            发布
          </span>
          <div v-if="activeTab === 'publish'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'workflow' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = 'workflow'"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide:workflow" class="size-4" />
            工作流
          </span>
          <div v-if="activeTab === 'workflow'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'tpl' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = 'tpl'"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide:layout-template" class="size-4" />
            排版管理
          </span>
          <div v-if="activeTab === 'tpl'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
        </button>
      </div>

      <!-- 页签内容 -->
      <div class="flex-1 min-h-0 overflow-auto">
        <DashboardTopicGenTab v-if="activeTab === 'topic'" />
        <DashboardMaterialTab v-if="activeTab === 'material'" />
        <DashboardDraftTab v-if="activeTab === 'draft'" />
        <DashboardImageTab v-if="activeTab === 'image'" />
        <DashboardLayoutTab v-if="activeTab === 'layout'" />
        <DashboardPublishTab v-if="activeTab === 'publish'" />
        <DashboardWorkflowTab v-if="activeTab === 'workflow'" />
        <DashboardLayoutTemplateTab v-if="activeTab === 'tpl'" />
      </div>
    </div>
  </div>
</template>

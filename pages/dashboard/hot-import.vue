<script setup lang="ts">
import { websiteName } from '~/config';

useHead({
  title: `内容沉淀 | ${websiteName}`,
});

const activeTab = ref('import');
</script>

<template>
  <div class="h-full">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">内容沉淀</h1>
    </Teleport>

    <div class="flex flex-col h-full px-3 py-3">
      <!-- 页签切换 -->
      <div class="flex border-b border-gray-200 dark:border-gray-700 mb-4">
        <button
          class="px-4 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'import' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = 'import'"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide:file-spreadsheet" class="size-4" />
            爆文导入
          </span>
          <div v-if="activeTab === 'import'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'analyze' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = 'analyze'"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide:sparkles" class="size-4" />
            爆文解析
          </span>
          <div v-if="activeTab === 'analyze'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'style' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = 'style'"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide:feather" class="size-4" />
            风格解析
          </span>
          <div v-if="activeTab === 'style'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'records' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = 'records'"
        >
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide:table-2" class="size-4" />
            解析查看
          </span>
          <div v-if="activeTab === 'records'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
        </button>
      </div>

      <!-- 页签内容 -->
      <div class="flex-1 min-h-0 overflow-auto">
        <DashboardHotImportTab v-if="activeTab === 'import'" />
        <DashboardHotAnalyzeTab v-if="activeTab === 'analyze'" />
        <DashboardStyleAnalyzeTab v-if="activeTab === 'style'" />
        <DashboardHotRecordsTab v-if="activeTab === 'records'" />
      </div>
    </div>
  </div>
</template>

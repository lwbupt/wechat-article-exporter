<script setup lang="ts">
import toastFactory from '~/composables/toast';

const toast = toastFactory();

interface WorkflowItem {
  id: number;
  account_id: number;
  account_name: string;
  topic_id: number;
  article_id: number;
  title: string;
  category: string;
  topic_status: string;
  topic_error: string;
  material_status: string;
  material_error: string;
  draft_status: string;
  draft_error: string;
  image_status: string;
  image_error: string;
  layout_status: string;
  layout_error: string;
  push_status: string;
  push_error: string;
  workflow_date: string;
  status: string;
  created_at: string;
  run_log: string | null;
}

interface AccountOption {
  id: number;
  name: string;
}

const workflows = ref<WorkflowItem[]>([]);
const accounts = ref<AccountOption[]>([]);
const loading = ref(false);
const filterDate = ref(new Date().toISOString().split('T')[0]);
const filterStatus = ref('');
const showTriggerModal = ref(false);
const triggerAccountId = ref<number | null>(null);
const expandedLogId = ref<number | null>(null);

interface LogEntry {
  stage: string;
  event: string;
  time: string;
  detail?: string;
}

function parseLog(wf: WorkflowItem): LogEntry[] {
  if (!wf.run_log) return [];
  try {
    return JSON.parse(wf.run_log);
  } catch {
    return [];
  }
}

function logEventColor(event: string): string {
  if (event === 'done') return 'text-green-500';
  if (event === 'error') return 'text-red-500';
  if (event === 'start') return 'text-blue-500';
  if (event === 'skipped') return 'text-yellow-500';
  return 'text-gray-500';
}

function formatLogTime(val: string): string {
  const d = new Date(val + 'Z');
  if (isNaN(d.getTime())) return val;
  return d.toLocaleString('zh-CN', { hour12: false });
}

const STAGES = [
  { key: 'topic', label: '选题', icon: 'i-lucide:lightbulb' },
  { key: 'material', label: '素材', icon: 'i-lucide:search' },
  { key: 'draft', label: '正文', icon: 'i-lucide:file-text' },
  { key: 'image', label: '配图', icon: 'i-lucide:image' },
  { key: 'layout', label: '排版', icon: 'i-lucide:palette' },
  { key: 'push', label: '推送', icon: 'i-lucide:send' },
] as const;

function stageStatus(wf: WorkflowItem, key: string): string {
  return (wf as any)[`${key}_status`] || 'pending';
}

function stageError(wf: WorkflowItem, key: string): string {
  return (wf as any)[`${key}_error`] || '';
}

function stageColor(wf: WorkflowItem, key: string): string {
  const status = stageStatus(wf, key);
  if (status === 'done') {
    // done 但有 error 描述 = 被跳过
    return stageError(wf, key) ? 'text-yellow-500' : 'text-green-500';
  }
  if (status === 'running') return 'text-blue-500 animate-pulse';
  if (status === 'error') return 'text-red-500';
  return 'text-gray-300';
}

function stageTextColor(wf: WorkflowItem, key: string): string {
  const status = stageStatus(wf, key);
  if (status === 'done') {
    return stageError(wf, key) ? 'text-yellow-600' : 'text-green-600';
  }
  if (status === 'error') return 'text-red-500';
  return 'text-gray-400';
}

function stageTooltip(wf: WorkflowItem, key: string): string {
  const status = stageStatus(wf, key);
  const err = stageError(wf, key);
  if (status === 'done' && err) return `已跳过: ${err}`;
  if (status === 'error') return err;
  if (status === 'done') return '已完成';
  if (status === 'running') return '执行中...';
  return '等待中';
}

function statusBadge(wf: WorkflowItem): { color: string; label: string } {
  switch (wf.status) {
    case 'done': {
      // 检查是否有阶段被跳过
      const hasSkipped = STAGES.some(s => stageStatus(wf, s.key) === 'done' && stageError(wf, s.key));
      return hasSkipped ? { color: 'yellow', label: '部分完成' } : { color: 'green', label: '完成' };
    }
    case 'running': return { color: 'blue', label: '运行中' };
    case 'error': return { color: 'red', label: '失败' };
    default: return { color: 'gray', label: '等待' };
  }
}

async function loadWorkflows() {
  loading.value = true;
  try {
    const params: any = { date: filterDate.value };
    if (filterStatus.value) params.status = filterStatus.value;
    const resp = await $fetch<{ success: boolean; data: WorkflowItem[] }>('/api/query/workflow/list', { params });
    if (resp.success) workflows.value = resp.data;
  } catch { /* 静默 */ }
  finally { loading.value = false; }
}

async function loadAccounts() {
  try {
    const resp = await $fetch<{ success: boolean; data: any[] }>('/api/query/managed-accounts');
    if (resp.success && resp.data) accounts.value = resp.data.filter(a => a.enabled);
  } catch { /* 静默 */ }
}

async function retryWorkflow(id: number) {
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/query/workflow/retry', { method: 'POST', body: { workflowId: id } });
    if (resp.success) {
      toast.success('已重试', '工作流重新执行中');
      setTimeout(loadWorkflows, 2000);
    } else {
      toast.error('重试失败', resp.error || '未知错误');
    }
  } catch (err: any) {
    toast.error('重试失败', err?.data?.error || err?.message || '请求失败');
  }
}

async function deleteWorkflow(id: number) {
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/query/workflow/delete', { method: 'POST', body: { workflowId: id } });
    if (resp.success) {
      toast.success('已删除', '工作流记录已移除');
      await loadWorkflows();
    } else {
      toast.error('删除失败', resp.error || '未知错误');
    }
  } catch (err: any) {
    toast.error('删除失败', err?.data?.error || err?.message || '请求失败');
  }
}

async function triggerWorkflow() {
  if (!triggerAccountId.value) {
    toast.error('请选择', '请先选择一个公众号');
    return;
  }
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/query/workflow/trigger', {
      method: 'POST',
      body: { accountId: triggerAccountId.value },
    });
    if (resp.success) {
      toast.success('已触发', '工作流已创建并开始执行');
      showTriggerModal.value = false;
      triggerAccountId.value = null;
      setTimeout(loadWorkflows, 2000);
    } else {
      toast.error('触发失败', resp.error || '未知错误');
    }
  } catch (err: any) {
    toast.error('触发失败', err?.data?.error || err?.message || '请求失败');
  }
}

watch([filterDate, filterStatus], loadWorkflows);

onMounted(() => {
  loadAccounts();
  loadWorkflows();
  // 每 10 秒刷新一次列表
  const timer = setInterval(loadWorkflows, 10000);
  onUnmounted(() => clearInterval(timer));
});
</script>

<template>
  <div class="flex flex-col h-full gap-3">
    <!-- 工具栏 -->
    <div class="flex items-center gap-3 flex-wrap">
      <input v-model="filterDate" type="date" class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm" />
      <select v-model="filterStatus" class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm">
        <option value="">全部状态</option>
        <option value="pending">等待</option>
        <option value="running">运行中</option>
        <option value="done">完成</option>
        <option value="error">失败</option>
      </select>
      <div class="flex-1" />
      <UButton icon="i-lucide:play" color="blue" size="sm" @click="showTriggerModal = true">手动触发</UButton>
      <UButton icon="i-lucide:refresh-cw" color="gray" variant="outline" size="sm" :loading="loading" @click="loadWorkflows">刷新</UButton>
    </div>

    <!-- 加载中 -->
    <div v-if="loading && workflows.length === 0" class="flex items-center justify-center py-12 text-gray-400">
      <UIcon name="i-lucide:loader-2" class="size-5 animate-spin mr-2" />加载中...
    </div>

    <!-- 空状态 -->
    <div v-else-if="workflows.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-center text-gray-400">
        <UIcon name="i-lucide:workflow" class="size-16 mb-3 opacity-40" />
        <p class="text-lg">暂无工作流记录</p>
        <p class="text-sm mt-1">点击"手动触发"为公众号创建文章生成任务</p>
      </div>
    </div>

    <!-- 工作流列表 -->
    <div v-else class="flex-1 min-h-0 overflow-auto space-y-2">
      <div v-for="wf in workflows" :key="wf.id" class="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
        <div class="flex items-center gap-2 mb-2">
          <span class="font-medium text-sm flex-1 truncate">{{ wf.title || '待选题' }}</span>
          <UBadge v-bind="statusBadge(wf)" variant="subtle" size="xs">{{ statusBadge(wf).label }}</UBadge>
          <span class="text-xs text-gray-400">{{ wf.account_name }}</span>
          <span class="text-xs text-gray-400">{{ wf.workflow_date }}</span>
          <UButton v-if="wf.status !== 'running'" icon="i-lucide:trash-2" size="2xs" color="gray" variant="ghost" @click="deleteWorkflow(wf.id)" />
        </div>

        <!-- 阶段进度条 -->
        <div class="flex items-center gap-1">
          <template v-for="(stage, idx) in STAGES" :key="stage.key">
            <div v-if="idx > 0" class="flex-1 h-0.5" :class="stageStatus(wf, stage.key) === 'done' || stageStatus(wf, STAGES[idx - 1].key) === 'done' ? 'bg-green-300' : 'bg-gray-200 dark:bg-gray-700'" />
            <div class="flex items-center gap-1 shrink-0" :title="stageTooltip(wf, stage.key)">
              <UIcon :name="stage.icon" class="size-4" :class="stageColor(wf, stage.key)" />
              <span class="text-[10px]" :class="stageTextColor(wf, stage.key)">{{ stage.label }}</span>
            </div>
          </template>
        </div>

        <!-- 错误信息 + 重试/删除 -->
        <div v-if="wf.status === 'error'" class="mt-2 flex items-center gap-2">
          <span class="text-xs text-red-400 truncate flex-1">
            <template v-for="stage in STAGES" :key="stage.key">
              <span v-if="stageStatus(wf, stage.key) === 'error'">{{ stage.label }}: {{ stageError(wf, stage.key) }}</span>
            </template>
          </span>
          <UButton icon="i-lucide:rotate-ccw" size="2xs" color="orange" variant="outline" @click="retryWorkflow(wf.id)">重试</UButton>
          <UButton icon="i-lucide:trash-2" size="2xs" color="red" variant="ghost" @click="deleteWorkflow(wf.id)">删除</UButton>
        </div>

        <!-- 跳过信息 + 重试 -->
        <div v-if="wf.status === 'done'" class="mt-2">
          <template v-for="stage in STAGES" :key="stage.key">
            <div v-if="stageStatus(wf, stage.key) === 'done' && stageError(wf, stage.key)" class="flex items-center gap-2">
              <span class="text-xs text-yellow-500 truncate flex-1">
                <UIcon name="i-lucide:alert-triangle" class="size-3 inline mr-1" />{{ stage.label }}: {{ stageError(wf, stage.key) }}
              </span>
              <UButton icon="i-lucide:rotate-ccw" size="2xs" color="blue" variant="outline" @click="retryWorkflow(wf.id)">重试推送</UButton>
            </div>
          </template>
        </div>

        <!-- 运行日志 -->
        <div v-if="parseLog(wf).length > 0" class="mt-2">
          <button class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1" @click="expandedLogId = expandedLogId === wf.id ? null : wf.id">
            <UIcon :name="expandedLogId === wf.id ? 'i-lucide:chevron-down' : 'i-lucide:chevron-right'" class="size-3" />
            运行日志 ({{ parseLog(wf).length }})
          </button>
          <div v-if="expandedLogId === wf.id" class="mt-1 rounded bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 p-2 max-h-48 overflow-auto">
            <div v-for="(log, i) in parseLog(wf)" :key="i" class="flex items-start gap-2 text-xs font-mono py-0.5" :class="i % 2 === 0 ? '' : 'bg-gray-100/50 dark:bg-gray-700/30'">
              <span class="text-gray-400 shrink-0 whitespace-nowrap">{{ formatLogTime(log.time) }}</span>
              <span class="shrink-0 font-semibold" :class="logEventColor(log.event)">{{ log.event === 'start' ? '开始' : log.event === 'done' ? '完成' : log.event === 'error' ? '失败' : log.event === 'skipped' ? '跳过' : log.event }}</span>
              <span class="text-gray-500 dark:text-gray-400 shrink-0">[{{ log.stage }}]</span>
              <span v-if="log.detail" class="text-gray-500 dark:text-gray-400 truncate">{{ log.detail }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 手动触发弹窗 -->
    <UModal v-model="showTriggerModal">
      <UCard>
        <template #header>
          <span class="font-semibold">手动触发工作流</span>
        </template>
        <p class="text-sm text-gray-500 mb-3">选择一个公众号，为其创建并执行文章生成工作流。</p>
        <select
          v-model="triggerAccountId"
          class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
        >
          <option :value="null" disabled>选择公众号</option>
          <option v-for="acc in accounts" :key="acc.id" :value="acc.id">{{ acc.name }}</option>
        </select>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="white" @click="showTriggerModal = false">取消</UButton>
            <UButton color="blue" :disabled="!triggerAccountId" @click="triggerWorkflow">触发</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

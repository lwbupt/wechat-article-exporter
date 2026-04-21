<script setup lang="ts">
import toastFactory from '~/composables/toast';

const toast = toastFactory();

interface Provider {
  id: string;
  name: string;
  apiBase: string;
  defaultModel: string;
  models: string[];
}

const providers = ref<Provider[]>([]);
const selectedProvider = ref('zhipu');
const apiKey = ref('');
const apiKeySet = ref(false);
const apiBase = ref('');
const model = ref('');
const loading = ref(false);
const testing = ref(false);
const showKey = ref(false);

const isCustom = computed(() => selectedProvider.value === 'custom');

const currentProvider = computed(() => providers.value.find(p => p.id === selectedProvider.value));
const modelOptions = computed(() => currentProvider.value?.models || []);

async function loadConfig() {
  try {
    const resp = await $fetch<{
      success: boolean;
      data?: { provider: string; apiKey: string; apiKeySet: boolean; apiBase: string; model: string };
      providers?: Provider[];
    }>('/api/query/settings/model-config');

    if (resp.success && resp.data) {
      selectedProvider.value = resp.data.provider || 'zhipu';
      apiKey.value = resp.data.apiKey;
      apiKeySet.value = resp.data.apiKeySet;
      apiBase.value = resp.data.apiBase;
      model.value = resp.data.model;
      providers.value = resp.providers || [];
    }
  } catch {
    // 静默
  }
}

onMounted(() => {
  loadConfig();
});

function onProviderChange() {
  const p = providers.value.find(p => p.id === selectedProvider.value);
  if (p && p.id !== 'custom') {
    apiBase.value = p.apiBase;
    model.value = p.defaultModel;
  }
}

async function saveConfig() {
  loading.value = true;
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/query/settings/model-config', {
      method: 'POST',
      body: {
        provider: selectedProvider.value,
        apiKey: apiKey.value,
        apiBase: apiBase.value,
        model: model.value,
      },
    });

    if (resp.success) {
      toast.success('保存成功', 'AI 模型配置已更新');
      await loadConfig();
    } else {
      toast.error('保存失败', resp.error || '未知错误');
    }
  } catch (err: any) {
    toast.error('保存失败', err?.message || '请求失败');
  } finally {
    loading.value = false;
  }
}

async function testConnection() {
  testing.value = true;
  try {
    // 先保存当前配置
    await $fetch('/api/query/settings/model-config', {
      method: 'POST',
      body: {
        provider: selectedProvider.value,
        apiKey: apiKey.value,
        apiBase: apiBase.value,
        model: model.value,
      },
    });

    // 调后端测试接口
    const resp = await $fetch<{ success: boolean; error?: string; message?: string }>(
      '/api/query/settings/model-config/test',
      { method: 'POST' }
    );

    if (resp.success) {
      toast.success('连通正常', resp.message || 'API 连接测试成功');
    } else {
      toast.error('连接失败', resp.error || '未知错误');
    }
  } catch (err: any) {
    toast.error('测试失败', err?.message || '请求失败');
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-5">
      <div class="flex items-center gap-2 mb-2">
        <UIcon name="i-lucide:brain" class="size-5 text-blue-500" />
        <h3 class="font-medium text-base">AI 模型配置</h3>
        <span v-if="apiKeySet" class="text-xs text-green-500 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded">已配置</span>
        <span v-else class="text-xs text-red-500 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded">未配置</span>
      </div>

      <!-- 服务商选择 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">服务商</label>
        <select
          v-model="selectedProvider"
          class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          @change="onProviderChange"
        >
          <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>

      <!-- API Key -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key</label>
        <div class="relative">
          <input
            v-model="apiKey"
            :type="showKey ? 'text' : 'password'"
            placeholder="输入 API Key"
            class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" @click="showKey = !showKey">
            <UIcon :name="showKey ? 'i-lucide:eye-off' : 'i-lucide:eye'" class="size-4" />
          </button>
        </div>
        <p v-if="apiKeySet && apiKey.includes('****')" class="text-xs text-gray-400 mt-1">已保存密钥（掩码显示），重新输入可覆盖</p>
      </div>

      <!-- API 地址 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API 地址</label>
        <input
          v-model="apiBase"
          :disabled="!isCustom"
          :class="!isCustom ? 'bg-gray-50 dark:bg-gray-900 cursor-not-allowed' : 'bg-white dark:bg-gray-800'"
          class="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="https://api.example.com/v1"
        />
        <p v-if="!isCustom" class="text-xs text-gray-400 mt-1">选择"自定义"服务商时可修改</p>
      </div>

      <!-- 模型名称 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">模型名称</label>
        <select
          v-if="modelOptions.length > 0"
          v-model="model"
          class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
        </select>
        <input
          v-else
          v-model="model"
          class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="model-name"
        />
      </div>

      <!-- 操作按钮 -->
      <div class="flex items-center gap-3 pt-2">
        <UButton color="blue" :loading="loading" :disabled="loading" @click="saveConfig">
          保存配置
        </UButton>
        <UButton color="gray" variant="outline" :loading="testing" :disabled="testing" @click="testConnection">
          测试连通性
        </UButton>
      </div>
    </div>
  </div>
</template>

/**
 * AI 模型配置统一管理
 * 从 DB settings 表读取，fallback 到 .env 环境变量
 */

import db from '~/server/database/index';

export interface ProviderTemplate {
  name: string;
  apiBase: string;
  defaultModel: string;
}

export const PROVIDERS: Record<string, ProviderTemplate> = {
  zhipu: { name: '智谱 GLM', apiBase: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-5', models: ['glm-5', 'glm-4-plus', 'glm-4-flash'] },
  deepseek: { name: 'DeepSeek', apiBase: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'] },
  bailian: {
    name: '阿里云百炼',
    apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long', 'deepseek-v3', 'deepseek-r1', 'glm-4-plus', 'moonshot-v1-8k', 'minimax-text-01'],
  },
  moonshot: { name: '月之暗面 Kimi', apiBase: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  openai: { name: 'OpenAI', apiBase: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'] },
  custom: { name: '自定义', apiBase: '', defaultModel: '' },
};

export interface AIConfig {
  apiKey: string;
  apiBase: string;
  model: string;
  provider?: string;
}

/**
 * 获取当前 AI 配置，优先 DB → fallback .env
 */
export function getAIConfig(): AIConfig {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('model_config') as { value: string } | undefined;
    if (row?.value) {
      const config = JSON.parse(row.value) as AIConfig;
      if (config.apiKey) {
        return {
          apiKey: config.apiKey,
          apiBase: config.apiBase || PROVIDERS[config.provider || '']?.apiBase || process.env.AI_API_BASE || 'https://open.bigmodel.cn/api/paas/v4',
          model: config.model || PROVIDERS[config.provider || '']?.defaultModel || process.env.AI_MODEL || 'glm-5',
          provider: config.provider,
        };
      }
    }
  } catch {
    // DB 读取失败，fallback
  }

  return {
    apiKey: process.env.AI_API_KEY || '',
    apiBase: process.env.AI_API_BASE || 'https://open.bigmodel.cn/api/paas/v4',
    model: process.env.AI_MODEL || 'glm-5',
  };
}

/**
 * 掩码 API Key，只显示后 4 位
 */
export function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return key ? '****' : '';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

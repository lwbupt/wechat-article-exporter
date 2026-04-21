/**
 * 获取 AI 模型配置
 * GET: 返回当前配置（apiKey 掩码）+ 服务商列表
 */

import { getAIConfig, maskApiKey, PROVIDERS } from '~/server/utils/ai-config';

export default defineEventHandler(() => {
  const config = getAIConfig();

  const providers = Object.entries(PROVIDERS).map(([key, val]) => ({
    id: key,
    name: val.name,
    apiBase: val.apiBase,
    defaultModel: val.defaultModel,
    models: val.models || [],
  }));

  return {
    success: true,
    data: {
      provider: config.provider || '',
      apiKey: maskApiKey(config.apiKey),
      apiKeySet: !!config.apiKey,
      apiBase: config.apiBase,
      model: config.model,
    },
    providers,
  };
});

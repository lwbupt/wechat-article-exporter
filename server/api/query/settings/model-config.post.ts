/**
 * 保存 AI 模型配置
 * POST: { provider, apiKey?, apiBase?, model? }
 */

import db from '~/server/database/index';
import { PROVIDERS, type AIConfig } from '~/server/utils/ai-config';

export default defineEventHandler(async event => {
  const body = await readBody(event);
  const { provider, apiKey, apiBase, model } = body;

  if (!provider) {
    return { success: false, error: '请选择服务商' };
  }

  const template = PROVIDERS[provider];
  if (!template) {
    return { success: false, error: '未知服务商' };
  }

  // 获取当前已保存的配置（用于保留 apiKey）
  let existingConfig: AIConfig | null = null;
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('model_config') as { value: string } | undefined;
    if (row?.value) existingConfig = JSON.parse(row.value);
  } catch {
    // ignore
  }

  // 如果 apiKey 包含 ****，说明前端没修改，保留原值
  let finalApiKey = apiKey;
  if (!apiKey || apiKey.includes('****')) {
    finalApiKey = existingConfig?.apiKey || process.env.AI_API_KEY || '';
  }

  const config: AIConfig = {
    provider,
    apiKey: finalApiKey,
    apiBase: provider === 'custom' ? (apiBase || '') : template.apiBase,
    model: provider === 'custom' ? (model || '') : (model || template.defaultModel),
  };

  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).run('model_config', JSON.stringify(config));

  return { success: true };
});

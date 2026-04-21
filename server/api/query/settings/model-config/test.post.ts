/**
 * 测试 AI 模型连通性
 * POST: 从 DB 读取真实配置，发一个简单请求测试
 */

import { getAIConfig } from '~/server/utils/ai-config';

export default defineEventHandler(async () => {
  const { apiKey, apiBase, model } = getAIConfig();

  if (!apiKey) {
    return { success: false, error: '未配置 API Key' };
  }

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '你好，回复OK即可' }],
        max_tokens: 10,
      }),
    });

    if (response.ok) {
      return { success: true, message: '连接正常' };
    }

    const errText = await response.text();
    return { success: false, error: `HTTP ${response.status}: ${errText.substring(0, 200)}` };
  } catch (err: any) {
    return { success: false, error: err?.message || '连接失败' };
  }
});

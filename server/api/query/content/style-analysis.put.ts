/**
 * 更新风格解析记录（微调保存）
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { id } = body;

    if (!id) {
      return { success: false, error: '缺少记录 ID' };
    }

    const fields: string[] = [];
    const params: any[] = [];

    const allowedFields = [
      'overall_summary',
      'persona_positioning',
      'surface_language',
      'oral_phrase_library',
      'deep_writing_traits',
      'taboos',
      'sample_excerpts',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        fields.push(`${field} = ?`);
        // 对象/数组类型序列化为 JSON 存储
        const val = typeof body[field] === 'object' ? JSON.stringify(body[field]) : body[field];
        params.push(val);
      }
    }

    if (fields.length === 0) {
      return { success: false, error: '没有需要更新的字段' };
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    db.prepare(`UPDATE account_writing_styles SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    return { success: true };
  } catch (error) {
    console.error('Failed to update style:', error);
    return { success: false, error: '更新失败' };
  }
});

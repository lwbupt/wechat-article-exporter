/**
 * 手动新增素材
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { content, type, tags, category, fakeid } = body as {
      content: string;
      type: string;
      tags?: string;
      category?: string;
      fakeid?: string;
    };

    if (!content?.trim() || !type) {
      return { success: false, error: '内容和类型不能为空' };
    }

    db.prepare(
      `INSERT INTO writing_materials (content, type, tags, source_type, category, fakeid)
       VALUES (?, ?, ?, 'manual', ?, ?)`,
    ).run(content.trim(), type, tags || '', category || '', fakeid || '');

    return { success: true };
  } catch (error) {
    console.error('Failed to add material:', error);
    return { success: false, error: '添加素材失败' };
  }
});

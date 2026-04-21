/**
 * 新增公众号运营记录
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const {
      name, appid, secret, description, category, persona, enabled, ext1, ext2,
      writing_style_id, layout_template_id, daily_publish_count, publish_time, auto_publish,
      image_mode, image_count, image_source, image_config,
      header_content, footer_content, section_prefix, section_suffix,
    } = body;

    if (!name) {
      return { success: false, error: '公众号名称不能为空' };
    }

    const result = db.prepare(
      `INSERT INTO managed_accounts (name, appid, secret, description, category, persona, enabled, ext1, ext2, writing_style_id, layout_template_id, daily_publish_count, publish_time, auto_publish, image_mode, image_count, image_source, image_config, header_content, footer_content, section_prefix, section_suffix)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      name, appid || null, secret || null, description || null, category || null,
      persona || null, enabled ? 1 : 0, ext1 || null, ext2 || null,
      writing_style_id || null, layout_template_id || null, daily_publish_count || 1,
      publish_time || '08:00', auto_publish ? 1 : 0,
      image_mode || '', image_count || 0, image_source || '', image_config || '',
      header_content || '', footer_content || '', section_prefix || '', section_suffix || '',
    );

    return { success: true, data: { id: result.lastInsertRowid } };
  } catch (error) {
    console.error('Failed to create managed account:', error);
    return { success: false, error: '创建失败' };
  }
});

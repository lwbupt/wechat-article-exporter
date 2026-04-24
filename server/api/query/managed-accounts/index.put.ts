/**
 * 更新公众号运营记录
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { id, name, appid, secret, description, category, persona, enabled, ext1, ext2,
            writing_style_id, layout_template_id, daily_publish_count, publish_time, auto_publish,
            image_mode, image_count, image_source, image_config,
            header_content, footer_content, section_prefix, section_suffix } = body;

    if (!id) {
      return { success: false, error: 'id 不能为空' };
    }

    // secret 仅在提供了新值时更新
    if (secret) {
      db.prepare(
        `UPDATE managed_accounts
         SET name = ?, appid = ?, secret = ?, description = ?, category = ?, persona = ?,
             enabled = ?, ext1 = ?, ext2 = ?,
             writing_style_id = ?, layout_template_id = ?, daily_publish_count = ?, publish_time = ?, auto_publish = ?,
             image_mode = ?, image_count = ?, image_source = ?, image_config = ?,
             header_content = ?, footer_content = ?, section_prefix = ?, section_suffix = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(name, appid || null, secret, description || null, category || null, persona || null, enabled ? 1 : 0, ext1 || null, ext2 || null,
            writing_style_id || null, layout_template_id || null, daily_publish_count || 1, publish_time || '08:00', auto_publish ? 1 : 0,
            image_mode || '', image_count || 0, image_source || '', image_config || '',
            header_content || '', footer_content || '', section_prefix || '', section_suffix || '', id);
    } else {
      db.prepare(
        `UPDATE managed_accounts
         SET name = ?, appid = ?, description = ?, category = ?, persona = ?,
             enabled = ?, ext1 = ?, ext2 = ?,
             writing_style_id = ?, layout_template_id = ?, daily_publish_count = ?, publish_time = ?, auto_publish = ?,
             image_mode = ?, image_count = ?, image_source = ?, image_config = ?,
             header_content = ?, footer_content = ?, section_prefix = ?, section_suffix = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(name, appid || null, description || null, category || null, persona || null, enabled ? 1 : 0, ext1 || null, ext2 || null,
            writing_style_id || null, layout_template_id || null, daily_publish_count || 1, publish_time || '08:00', auto_publish ? 1 : 0,
            image_mode || '', image_count || 0, image_source || '', image_config || '',
            header_content || '', footer_content || '', section_prefix || '', section_suffix || '', id);
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to update managed account:', error);
    return { success: false, error: '更新失败' };
  }
});

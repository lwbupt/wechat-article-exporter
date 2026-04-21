/**
 * 更新公众号运营记录
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { id, name, appid, secret, description, category, persona, enabled, ext1, ext2,
            writingStyleId, layoutTemplateId, dailyPublishCount, publishTime, autoPublish,
            imageMode, imageCount, imageSource, imageConfig,
            headerContent, footerContent, sectionPrefix, sectionSuffix } = body;

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
            writingStyleId || null, layoutTemplateId || null, dailyPublishCount || 1, publishTime || '08:00', autoPublish ? 1 : 0,
            imageMode || '', imageCount || 0, imageSource || '', imageConfig || '',
            headerContent || '', footerContent || '', sectionPrefix || '', sectionSuffix || '', id);
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
            writingStyleId || null, layoutTemplateId || null, dailyPublishCount || 1, publishTime || '08:00', autoPublish ? 1 : 0,
            imageMode || '', imageCount || 0, imageSource || '', imageConfig || '',
            headerContent || '', footerContent || '', sectionPrefix || '', sectionSuffix || '', id);
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to update managed account:', error);
    return { success: false, error: '更新失败' };
  }
});

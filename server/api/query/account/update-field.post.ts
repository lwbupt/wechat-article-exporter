/**
 * 更新公众号的单个字段
 * 用于前端表格内联编辑 category 和 is_monitored
 */

import { updateAccountCategory, updateAccountMonitored } from '~/server/database/models/account';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { fakeid, field, value } = body;

    if (!fakeid || !field) {
      return {
        success: false,
        error: 'Missing required fields: fakeid, field',
      };
    }

    if (field === 'category') {
      updateAccountCategory(fakeid, value || null);
    } else if (field === 'is_monitored') {
      updateAccountMonitored(fakeid, !!value);
    } else {
      return {
        success: false,
        error: `Unsupported field: ${field}`,
      };
    }

    return {
      success: true,
      message: `Updated ${field} for account ${fakeid}`,
    };
  } catch (error) {
    console.error('Failed to update account field:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

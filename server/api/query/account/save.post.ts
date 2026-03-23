/**
 * 保存公众号到数据库
 * 用户选择添加公众号时调用此接口
 */

import { syncAccount } from '~/server/utils/db-sync';

interface SaveAccountBody {
  fakeid: string;
  nickname: string;
  round_head_img: string;
  signature: string;
  service_type: number;
}

export default defineEventHandler(async event => {
  try {
    const body = (await readBody(event)) as SaveAccountBody;

    if (!body.fakeid || !body.nickname) {
      return {
        success: false,
        error: 'fakeid and nickname are required',
      };
    }

    // 同步公众号到数据库
    syncAccount({
      fakeid: body.fakeid,
      nickname: body.nickname,
      round_head_img: body.round_head_img,
      signature: body.signature,
      service_type: body.service_type,
    });

    return {
      success: true,
      message: 'Account saved successfully',
    };
  } catch (error) {
    console.error('Failed to save account:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

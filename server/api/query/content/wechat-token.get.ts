/**
 * 获取微信公众号 access_token
 * 优先从缓存读取，过期则重新获取
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const accountId = Number(query.accountId);

  if (!accountId) {
    return { success: false, error: '缺少 accountId' };
  }

  try {
    const account = db
      .prepare('SELECT id, name, appid, secret FROM managed_accounts WHERE id = ?')
      .get(accountId) as { id: number; name: string; appid: string; secret: string } | undefined;

    if (!account) {
      return { success: false, error: '公众号不存在' };
    }
    if (!account.appid || !account.secret) {
      return { success: false, error: '该公众号未配置 AppID 或 Secret' };
    }

    // 检查缓存
    const cached = db
      .prepare('SELECT access_token, expires_at FROM wechat_tokens WHERE account_id = ?')
      .get(accountId) as { access_token: string; expires_at: number } | undefined;

    if (cached && cached.expires_at > Date.now()) {
      return {
        success: true,
        data: {
          accessToken: cached.access_token,
          expiresIn: Math.floor((cached.expires_at - Date.now()) / 1000),
          cached: true,
        },
      };
    }

    // 获取新 token
    const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${account.appid}&secret=${account.secret}`;
    const resp = await fetch(tokenUrl);
    const data = await resp.json() as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string };

    if (!data.access_token) {
      const errMsg = `微信 API 错误 (${data.errcode}): ${data.errmsg}`;
      console.error(`[WeChat Token] ${errMsg}`);
      return { success: false, error: errMsg };
    }

    // 缓存（提前 5 分钟过期）
    const expiresAt = Date.now() + (data.expires_in! - 300) * 1000;
    db.prepare(`
      INSERT INTO wechat_tokens (account_id, access_token, expires_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(account_id) DO UPDATE SET
        access_token = excluded.access_token,
        expires_at = excluded.expires_at,
        updated_at = CURRENT_TIMESTAMP
    `).run(accountId, data.access_token, expiresAt);

    return {
      success: true,
      data: {
        accessToken: data.access_token,
        expiresIn: data.expires_in,
        cached: false,
      },
    };
  } catch (error) {
    console.error('Get wechat token failed:', error);
    return { success: false, error: '获取 access_token 失败' };
  }
});

import { type CookieEntity } from '~/server/utils/CookieStore';

export type CookieKVKey = string;

export interface CookieKVValue {
  token: string;
  authKey: string; // 添加 authKey 字段
  cookies: CookieEntity[];
}

export async function setMpCookie(key: CookieKVKey, data: CookieKVValue): Promise<boolean> {
  const kv = useStorage('kv');
  try {
    await kv.set<CookieKVValue>(`cookie:${key}`, data, {
      // https://developers.cloudflare.com/kv/api/write-key-value-pairs/#expiring-keys
      expirationTtl: 60 * 60 * 24 * 4, // 4 days
    });
    return true;
  } catch (err) {
    console.error('kv.set call failed:', err);
    return false;
  }
}

export async function getMpCookie(key: CookieKVKey): Promise<CookieKVValue | null> {
  const kv = useStorage('kv');
  return await kv.get<CookieKVValue>(`cookie:${key}`);
}

/**
 * 获取所有已保存的登录信息（包含 auth-key）
 * 兼容旧数据格式（没有 authKey 字段的情况）
 */
export async function getAllMpCookies(): Promise<CookieKVValue[]> {
  const kv = useStorage('kv');
  const keys = await kv.getKeys('cookie:');

  const cookies: CookieKVValue[] = [];
  for (const key of keys) {
    const cookie = await kv.get<CookieKVValue>(key);
    if (cookie) {
      // 兼容旧数据：如果没有 authKey，使用 token 的前10位作为临时的 authKey
      if (!cookie.authKey) {
        const authKey = key.replace('cookie:', '');
        if (authKey) {
          cookie.authKey = authKey;
        }
      }
      cookies.push(cookie);
    }
  }

  return cookies;
}

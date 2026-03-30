import { type CookieEntity } from '~/server/utils/CookieStore';

export type CookieKVKey = string;

export type CookieKVValue = {
  token: string;
  authKey: string;
  cookies: CookieEntity[];
};

export async function setMpCookie(key: CookieKVKey, data: CookieKVValue): Promise<boolean> {
  const kv = useStorage('kv');
  try {
    if (!data.authKey) {
      data.authKey = key;
    }
    await kv.set<CookieKVValue>(`cookie:${key}`, data, {
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
  const cookie = await kv.get<CookieKVValue>(`cookie:${key}`);

  if (cookie && !cookie.authKey) {
    cookie.authKey = key;
  }
  return cookie;
}

/**
 * 获取所有已保存的登录信息（包含 auth-key)
 * 兼容旧数据格式（没有 authKey 字段的情况)
 */
export async function getAllMpCookies(): Promise<CookieKVValue[]> {
  const kv = useStorage('kv');
  const keys = await kv.getKeys('cookie:');

  const cookies: CookieKVValue[] = [];
  for (const key of keys) {
    const cookie = await kv.get<CookieKVValue>(key);
    if (cookie) {
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

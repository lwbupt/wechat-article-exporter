/**
 * 检查登录状态
 * 如果后端有有效的登录信息，返回用户信息
 */

import dayjs from 'dayjs';
import { getAllMpCookies } from '~/server/kv/cookie';
import { getTokenFromStore } from '~/server/utils/CookieStore';
import { proxyMpRequest } from '~/server/utils/proxy-request';

export default defineEventHandler(async event => {
  try {
    // 首先尝试从请求中获取 token 和 authKey
    let token = await getTokenFromStore(event);
    let authKey = getRequestHeader(event, 'X-Auth-Key');
    let cookie = null;

    // 如果请求中没有 token，尝试从 KV 存储中查找第一个有效的登录信息
    if (!token) {
      const allCookies = await getAllMpCookies();
      if (allCookies && allCookies.length > 0) {
        // 取第一个登录信息
        const firstLogin = allCookies[0];
        token = firstLogin.token;
        authKey = firstLogin.authKey;

        // 构造 cookie 字符串
        if (firstLogin.cookies && firstLogin.cookies.length > 0) {
          const cookieParts = firstLogin.cookies.map(c => `${c.name}=${c.value}`).join('; ');
          cookie = cookieParts;
          console.log('[LoginCheck] 从 KV 存储中找到登录信息:', token.substring(0, 10) + '...');
        }
      }
    }

    if (!token) {
      return {
        success: false,
        logged_in: false,
        message: '未登录',
      };
    }

    // 尝试获取用户信息来验证 token 是否有效
    try {
      const html: string = await proxyMpRequest({
        event: event,
        method: 'GET',
        endpoint: 'https://mp.weixin.qq.com/cgi-bin/home',
        query: {
          t: 'home/index',
          token: token,
          lang: 'zh_CN',
        },
        cookie: cookie || undefined, // 传入完整的 cookies
      }).then(resp => resp.text());

      // 提取昵称
      let nick_name = '';
      const nicknameMatchResult = html.match(/wx\.cgiData\.nick_name\s*?=\s*?"(?<nick_name>[^"]+)"/);
      if (nicknameMatchResult && nicknameMatchResult.groups && nicknameMatchResult.groups.nick_name) {
        nick_name = nicknameMatchResult.groups.nick_name;
      }

      // 提取头像
      let head_img = '';
      const headImgMatchResult = html.match(/wx\.cgiData\.head_img\s*?=\s*?"(?<head_img>[^"]+)"/);
      if (headImgMatchResult && headImgMatchResult.groups && headImgMatchResult.groups.head_img) {
        head_img = headImgMatchResult.groups.head_img;
      }

      // 如果能获取到用户信息，说明 token 有效
      if (nick_name) {
        return {
          success: true,
          logged_in: true,
          data: {
            nickname: nick_name,
            avatar: head_img,
            expires: dayjs().add(4, 'days').toString(),
            authKey: authKey,
            token: token,
          },
        };
      }
    } catch (error) {
      // token 可能已过期
      console.error('Token validation failed:', error);
    }

    return {
      success: false,
      logged_in: false,
      message: '登录已过期',
    };
  } catch (error) {
    console.error('Failed to check login status:', error);
    return {
      success: false,
      logged_in: false,
      message: '检查登录状态失败',
    };
  }
});

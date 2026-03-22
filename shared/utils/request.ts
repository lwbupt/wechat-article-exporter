/**
 * 封装 $fetch 无重试请求
 */
export const request = $fetch.create({
  retry: 0,
  method: 'GET',
  async onRequest({ request, options }) {
    // 在客户端请求中，如果有 authKey，添加到 header 中
    if (import.meta.client) {
      const loginAccountStr = localStorage.getItem('login');
      if (loginAccountStr) {
        try {
          const loginAccount = JSON.parse(loginAccountStr);
          if (loginAccount?.authKey) {
            options.headers = new Headers(options.headers);
            options.headers.set('X-Auth-Key', loginAccount.authKey);
          }
        } catch (e) {
          console.error('Failed to parse loginAccount:', e);
        }
      }
    }
  },
  async onResponse({ request, response, options, error }) {
    // 需要注意的是，这里有可能是客户端和服务器端调用
  },
  async onResponseError({ request, response, options, error }) {},
});

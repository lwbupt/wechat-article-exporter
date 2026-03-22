/**
 * 自动检查并恢复登录状态
 * 在应用启动时调用，如果后端有有效的登录信息，自动恢复前端登录状态
 */

export default () => {
  const loginAccount = useLoginAccount();

  /**
   * 检查后端登录状态并恢复前端状态
   */
  async function checkAndRestoreLogin(): Promise<boolean> {
    // 如果前端已经有登录状态，直接返回
    if (loginAccount.value) {
      return true;
    }

    try {
      const response = await $fetch<{
        success: boolean;
        logged_in: boolean;
        data?: {
          nickname: string;
          avatar: string;
          expires: string;
          authKey?: string;
          token?: string;
        };
      }>('/api/web/login/check');

      if (response?.success && response.logged_in && response.data) {
        // 后端有有效的登录信息，恢复前端状态
        loginAccount.value = {
          nickname: response.data.nickname,
          avatar: response.data.avatar,
          expires: response.data.expires,
          authKey: response.data.authKey,
          token: response.data.token,
        };
        console.log('[AutoLogin] 登录状态已从后端恢复');
        return true;
      }

      console.log('[AutoLogin] 后端无有效登录信息');
      return false;
    } catch (error) {
      console.error('[AutoLogin] 检查登录状态失败:', error);
      return false;
    }
  }

  return {
    checkAndRestoreLogin,
  };
};

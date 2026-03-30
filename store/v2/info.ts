/**
 * 公众号数据管理
 * 数据源：后端 SQLite 数据库
 */

export interface MpAccount {
  fakeid: string;
  completed: boolean;
  count: number;
  articles: number;

  // 公众号昵称
  nickname?: string;
  // 公众号头像
  round_head_img?: string;

  // 公众号文章总数
  total_count: number;
  create_time?: number;
  update_time?: number;

  // 最后更新时间
  last_update_time?: number;

  // 账号类别
  category?: string;
  // 是否监控
  is_monitored?: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * 获取所有公众号（从后端数据库）
 */
export async function getAllInfo(): Promise<MpAccount[]> {
  try {
    const response = await $fetch<ApiResponse<MpAccount[]>>('/api/query/accounts');
    if (response?.success && response.data) {
      return response.data;
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch accounts from backend:', error);
    return [];
  }
}

/**
 * 获取单个公众号信息（从后端数据库）
 * @param fakeid
 */
export async function getInfoCache(fakeid: string): Promise<MpAccount | undefined> {
  try {
    const response = await $fetch<ApiResponse<MpAccount[]>>(`/api/query/accounts?fakeid=${fakeid}`);
    if (response?.success && response.data && response.data.length > 0) {
      return response.data[0];
    }
    return undefined;
  } catch (error) {
    console.error(`Failed to fetch account ${fakeid} from backend:`, error);
    return undefined;
  }
}

/**
 * 更新公众号缓存（通过后端同步，此函数保留用于兼容）
 * @param mpAccount
 * @deprecated 数据由后端自动同步，无需手动更新
 */
export async function updateInfoCache(_mpAccount: MpAccount): Promise<boolean> {
  // 数据由后端 API 自动同步，这里直接返回成功
  // 保留此函数以保持兼容性
  return true;
}

/**
 * 更新最后更新时间（由后端处理）
 * @param fakeid
 * @deprecated 由后端自动处理
 */
export async function updateLastUpdateTime(_fakeid: string): Promise<boolean> {
  // 由后端自动处理
  return true;
}

/**
 * 获取公众号的名称
 */
export async function getAccountNameByFakeid(fakeid: string): Promise<string | null> {
  const account = await getInfoCache(fakeid);
  if (!account) {
    return null;
  }
  return account.nickname || null;
}

/**
 * 批量导入公众号
 * 需要通过后端搜索并添加，这里仅作为接口保留
 */
export async function importMpAccounts(mpAccounts: MpAccount[]): Promise<void> {
  // 批量导入需要通过后端 API 逐个添加公众号
  // 这里保留接口，实际导入流程在前端页面处理
  console.log('Import accounts (handled by frontend flow):', mpAccounts.length);
}

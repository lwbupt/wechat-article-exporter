import { db } from './db';

interface ApiResponse {
  success: boolean;
  message?: string;
  error?: string;
  deletedCount?: number;
}

// 删除公众号数据（通过后端 API）
export async function deleteAccountData(ids: string[]): Promise<void> {
  try {
    const fakeids = ids.join(',');
    const response = await $fetch<ApiResponse>(`/api/query/account/delete?fakeids=${fakeids}`, {
      method: 'DELETE',
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Failed to delete accounts');
    }

    console.log(`Deleted ${response.deletedCount} account(s)`);
  } catch (error) {
    console.error('Failed to delete account data:', error);
    throw error;
  }
}

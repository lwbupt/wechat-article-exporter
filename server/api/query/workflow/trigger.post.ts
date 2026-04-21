/**
 * 手动触发工作流（为指定账号创建并执行）
 */

import { createWorkflow, runWorkflow } from '~/server/utils/workflow-engine';
import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { accountId } = body as { accountId: number };

    if (!accountId) {
      return { success: false, error: '请选择公众号' };
    }

    const account = db.prepare('SELECT * FROM managed_accounts WHERE id = ?').get(accountId) as any;
    if (!account) {
      return { success: false, error: '公众号不存在' };
    }

    const wfId = createWorkflow(accountId, account.category || '');

    // 异步执行
    runWorkflow(wfId).catch(err => {
      console.error(`[Trigger workflow ${wfId}]`, err.message);
    });

    return { success: true, data: { workflowId: wfId } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '触发失败' };
  }
});

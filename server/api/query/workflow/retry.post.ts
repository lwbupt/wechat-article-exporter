/**
 * 重试工作流（从失败/跳过阶段续跑）
 */

import { getWorkflow, runWorkflow } from '~/server/utils/workflow-engine';
import db from '~/server/database/index';

const STAGES = ['topic', 'material', 'draft', 'image', 'layout', 'push'] as const;

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { workflowId } = body as { workflowId: number };

    if (!workflowId) {
      return { success: false, error: '缺少工作流 ID' };
    }

    const wf = getWorkflow(workflowId);
    if (!wf) {
      return { success: false, error: '工作流不存在' };
    }

    if (wf.status === 'running') {
      return { success: false, error: '工作流正在运行中，请稍后重试' };
    }

    // 重置 error 阶段 + 被跳过的阶段（done 但有 error 描述）
    let resetCount = 0;
    for (const stage of STAGES) {
      const status = wf[`${stage}_status`];
      const error = wf[`${stage}_error`];
      if (status === 'error' || (status === 'done' && error)) {
        db.prepare(`UPDATE article_workflow SET ${stage}_status = 'pending', ${stage}_error = NULL WHERE id = ?`).run(workflowId);
        resetCount++;
      }
    }

    if (resetCount === 0) {
      return { success: false, error: '没有需要重试的阶段' };
    }

    // 重置整体状态为 pending
    db.prepare("UPDATE article_workflow SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(workflowId);

    // 异步执行
    runWorkflow(workflowId).catch(err => {
      console.error(`[Retry workflow ${workflowId}]`, err.message);
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '重试失败' };
  }
});

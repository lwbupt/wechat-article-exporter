/**
 * 删除工作流
 */

import db from '~/server/database/index';

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { workflowId } = body as { workflowId: number };

    if (!workflowId) {
      return { success: false, error: '缺少工作流 ID' };
    }

    const wf = db.prepare('SELECT id, status FROM article_workflow WHERE id = ?').get(workflowId) as any;
    if (!wf) {
      return { success: false, error: '工作流不存在' };
    }

    // 不允许删除正在运行的工作流
    if (wf.status === 'running') {
      return { success: false, error: '不能删除正在运行的工作流' };
    }

    db.prepare('DELETE FROM article_workflow WHERE id = ?').run(workflowId);
    return { success: true };
  } catch (error) {
    console.error('Delete workflow failed:', error);
    return { success: false, error: '删除失败' };
  }
});

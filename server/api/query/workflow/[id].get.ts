/**
 * 查询单条工作流详情
 */

import { getWorkflow } from '~/server/utils/workflow-engine';

export default defineEventHandler(event => {
  const id = Number(getRouterParam(event, 'id'));
  if (!id) {
    return { success: false, error: '无效的工作流 ID' };
  }

  const wf = getWorkflow(id);
  if (!wf) {
    return { success: false, error: '工作流不存在' };
  }

  return { success: true, data: wf };
});

/**
 * 查询工作流列表
 */

import { listWorkflows } from '~/server/utils/workflow-engine';

export default defineEventHandler(event => {
  const query = getQuery(event);
  const workflows = listWorkflows({
    date: query.date as string,
    status: query.status as string,
    accountId: query.accountId ? Number(query.accountId) : undefined,
  });
  return { success: true, data: workflows };
});

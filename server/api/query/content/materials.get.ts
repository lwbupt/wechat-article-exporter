/**
 * 查询选题素材
 * GET: ?topicId=xxx
 */

import db from '~/server/database/index';

interface Material {
  id: number;
  topic_id: number;
  source: string;
  title: string;
  content: string;
  url: string;
  category: string;
  created_at: string;
}

export default defineEventHandler(event => {
  const query = getQuery(event);
  const topicId = query.topicId as string;

  if (!topicId) {
    return { success: false, error: 'topicId is required' };
  }

  const materials = db
    .prepare('SELECT * FROM topic_materials WHERE topic_id = ? ORDER BY source, id')
    .all(topicId) as Material[];

  const local = materials.filter(m => m.source === 'local');
  const web = materials.filter(m => m.source === 'web');

  return {
    success: true,
    data: { materials, local, web, total: materials.length },
  };
});

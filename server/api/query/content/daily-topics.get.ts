/**
 * 查询每日话题 API
 * 支持按日期查询，默认查今天
 */

import db from '~/server/database/index';

interface DailyTopic {
  id: number;
  topic_date: string;
  category: string;
  title: string;
  angle: string;
  viral_point: string;
  email_subject: string;
  created_at: string;
}

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const date = (query.date as string) || new Date().toISOString().split('T')[0];

    const topics = db
      .prepare('SELECT * FROM daily_topics WHERE topic_date = ? ORDER BY category, id')
      .all(date) as DailyTopic[];

    // 获取有数据的日期列表（最近 30 天）
    const dates = db
      .prepare(
        `SELECT DISTINCT topic_date FROM daily_topics
         WHERE topic_date >= date('now', '-30 days')
         ORDER BY topic_date DESC`
      )
      .all() as { topic_date: string }[];

    return {
      success: true,
      data: {
        date,
        topics,
        availableDates: dates.map(d => d.topic_date),
      },
    };
  } catch (error) {
    console.error('Query daily topics failed:', error);
    return { success: false, error: error instanceof Error ? error.message : '查询失败' };
  }
});

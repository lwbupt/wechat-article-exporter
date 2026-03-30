/**
 * 定时监控公众号最新发文 - 核心逻辑
 * 放在 server/utils/ 下，Nitro 自动导入，供插件和 API 共享
 */

import db from '../database/index';
import { insertMonitorLog } from '../database/models/monitor-log';
import { syncArticles, syncAccountStats } from './db-sync';
import { AccountCookie } from './CookieStore';
import { getAllMpCookies } from '../kv/cookie';
import { USER_AGENT } from '~/config';

let isCheckRunning = false;
let isSchedulerEnabled = true;

const CHECK_ARTICLE_COUNT = 2;
const SCHEDULED_HOURS = [0, 4, 8, 12, 16, 20];
let lastExecutedHour = -1;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

function getMonitoredAccounts() {
  return db.prepare('SELECT * FROM mp_accounts WHERE is_monitored = 1').all() as any[];
}

async function getAllCredentials(): Promise<{ cookie: string; token: string }[]> {
  try {
    const allCookies = await getAllMpCookies();
    return allCookies
      .map(saved => {
        const accountCookie = AccountCookie.create(saved.token, saved.cookies);
        const cookieStr = accountCookie.toString();
        return cookieStr ? { cookie: cookieStr, token: saved.token || '' } : null;
      })
      .filter(Boolean) as { cookie: string; token: string }[];
  } catch (e) {
    console.error('[Monitor] 从 KV 加载 cookie 失败:', e);
    return [];
  }
}

/**
 * 尝试用给定凭证请求微信 API，返回响应结果
 * 返回 null 表示凭证过期(200003)，应尝试下一个凭证
 */
async function tryFetchArticles(
  fakeid: string,
  cookieStr: string,
  token: string,
): Promise<{ resp: any; error?: string } | null> {
  const params = new URLSearchParams({
    sub: 'list',
    search_field: 'null',
    begin: '0',
    count: String(CHECK_ARTICLE_COUNT),
    query: '',
    fakeid: fakeid,
    type: '101_1',
    free_publish_type: '1',
    sub_action: 'list_ex',
    token: token,
    lang: 'zh_CN',
    f: 'json',
    ajax: '1',
  });

  const response = await fetch(
    `https://mp.weixin.qq.com/cgi-bin/appmsgpublish?${params.toString()}`,
    {
      headers: {
        'User-Agent': USER_AGENT,
        Referer: 'https://mp.weixin.qq.com/',
        Origin: 'https://mp.weixin.qq.com',
        Cookie: cookieStr,
      },
    },
  );

  const resp = (await response.json()) as any;

  if (resp?.base_resp?.ret === 200003) {
    return null; // 凭证过期，返回 null 让调用方尝试下一个
  }

  if (resp?.base_resp?.ret === 0 && resp?.publish_page) {
    return { resp };
  }

  return { resp, error: resp?.base_resp?.err_msg || '获取文章列表失败' };
}

async function checkAccount(
  account: any,
  credentials: { cookie: string; token: string }[],
): Promise<void> {
  const logEntry = {
    fakeid: account.fakeid,
    nickname: account.nickname,
    avatar: account.round_head_img,
    check_time: Math.floor(Date.now() / 1000),
    new_count: 0,
    new_titles: [] as string[],
    error: undefined as string | undefined,
  };

  try {
    const existingRows = db
      .prepare('SELECT aid FROM articles WHERE fakeid = ? ORDER BY create_time DESC LIMIT ?')
      .all(account.fakeid, CHECK_ARTICLE_COUNT) as { aid: string }[];
    const existingAids = new Set(existingRows.map(r => r.aid));

    // 逐个尝试凭证，直到找到一个有效的
    let result: { resp: any; error?: string } | null = null;
    for (const cred of credentials) {
      result = await tryFetchArticles(account.fakeid, cred.cookie, cred.token);
      if (result !== null) break;
      console.log(`[Monitor] ${account.nickname}: 凭证过期，尝试下一个...`);
    }

    if (result === null) {
      logEntry.error = '所有登录凭证均已过期，请重新扫码登录';
    } else if (result.error) {
      logEntry.error = result.error;
    } else {
      const publishPage = JSON.parse(result.resp.publish_page);
      const publishList = publishPage.publish_list || [];
      const articles = publishList
        .filter((item: any) => !!item.publish_info)
        .flatMap((item: any) => {
          const info = JSON.parse(item.publish_info);
          return info.appmsgex || [];
        });

      if (articles.length > 0) {
        syncArticles(account.fakeid, articles);
      }

      const totalCount = publishPage.total_count || 0;
      const stats = db
        .prepare(
          `
        SELECT
          COUNT(DISTINCT CASE WHEN itemidx = 1 THEN aid END) as count,
          COUNT(DISTINCT aid) as articles
        FROM articles WHERE fakeid = ?
      `,
        )
        .get(account.fakeid) as { count: number; articles: number };

      syncAccountStats(account.fakeid, {
        total_count: totalCount,
        count: stats.count,
        articles: stats.articles,
        completed: stats.count >= totalCount,
        update_time: Math.floor(Date.now() / 1000),
      });

      const newArticles = articles.filter((a: any) => !existingAids.has(String(a.aid)));
      logEntry.new_count = newArticles.length;
      logEntry.new_titles = newArticles.map((a: any) => a.title).filter(Boolean);
    }
  } catch (error: any) {
    logEntry.error = error.message || '检查失败';
  }

  insertMonitorLog(logEntry);
  console.log(
    `[Monitor] ${account.nickname}: ${logEntry.error ? '错误 - ' + logEntry.error : logEntry.new_count + ' 篇新文章'}`,
  );
}

export async function runMonitorCheck() {
  if (isCheckRunning) {
    console.log('[Monitor] 上一轮检查尚未完成，跳过');
    return;
  }

  const accounts = getMonitoredAccounts();
  if (accounts.length === 0) {
    console.log('[Monitor] 没有监控中的公众号');
    return;
  }

  const credentials = await getAllCredentials();
  if (credentials.length === 0) {
    console.log('[Monitor] 无可用登录凭证，跳过');
    for (const account of accounts) {
      insertMonitorLog({
        fakeid: account.fakeid,
        nickname: account.nickname,
        avatar: account.round_head_img,
        check_time: Math.floor(Date.now() / 1000),
        new_count: 0,
        error: '无可用登录凭证',
      });
    }
    return;
  }

  isCheckRunning = true;
  console.log(`[Monitor] 开始检查 ${accounts.length} 个公众号（${credentials.length} 个凭证）...`);

  try {
    for (let i = 0; i < accounts.length; i++) {
      await checkAccount(accounts[i], credentials);
      if (i < accounts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    console.log('[Monitor] 本轮检查完成');
  } finally {
    isCheckRunning = false;
  }
}

export function startScheduler() {
  if (schedulerTimer) return;
  isSchedulerEnabled = true;

  schedulerTimer = setInterval(() => {
    const now = new Date();
    const bjHour = now.getUTCHours() + 8;
    const hour = bjHour >= 24 ? bjHour - 24 : bjHour;
    const minute = now.getUTCMinutes();

    if (minute <= 1 && SCHEDULED_HOURS.includes(hour) && lastExecutedHour !== hour) {
      lastExecutedHour = hour;
      console.log(`[Monitor] 定时触发: ${new Date().toLocaleString('zh-CN')}`);
      runMonitorCheck();
    }

    if (minute > 2) {
      lastExecutedHour = -1;
    }
  }, 60_000);

  console.log('[Monitor] 调度器已启动');
}

export function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  isSchedulerEnabled = false;
  console.log('[Monitor] 调度器已停止');
}

export function getIsCheckRunning() {
  return isCheckRunning;
}

export function getIsSchedulerEnabled() {
  return isSchedulerEnabled;
}

/**
 * 解析 Excel 文件并批量导入爆文数据
 * 接收 multipart/form-data 上传的 Excel 文件，后端解析并保存到 SQLite
 */

import { getArticleByLink, upsertArticle } from '~/server/database/models/article';
import db from '~/server/database/index';
import { getArticleIdByLink } from '~/server/database/models/html';
import { upsertArticleMetadata } from '~/server/database/models/metadata';
import ExcelJS from 'exceljs';

interface PreviewArticle {
  publishDate: string;
  accountName: string;
  title: string;
  url: string;
  readNum: number;
  likeNum: number;
  hotScore: number;
  isFavorited: boolean;
}

function getCellValue(row: ExcelJS.Row, colNumber: number | undefined): any {
  if (!colNumber) return undefined;
  const cell = row.getCell(colNumber);
  if (cell.value instanceof Date) {
    const d = cell.value;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (typeof cell.value === 'object' && cell.value !== null && 'richText' in cell.value) {
    return (cell.value as any).richText.map((r: any) => r.text).join('');
  }
  return cell.value;
}

export default defineEventHandler(async event => {
  try {
    const formData = await readMultipartFormData(event);
    if (!formData || formData.length === 0) {
      return { success: false, error: 'No file uploaded' };
    }

    const file = formData.find(f => f.name === 'file');
    if (!file || !file.data) {
      return { success: false, error: 'No file field in upload' };
    }

    // 用 exceljs 解析
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.data);

    const ws = workbook.worksheets[0];
    if (!ws) {
      return { success: false, error: 'Excel 中没有工作表' };
    }

    // 读取表头映射
    const headerRow = ws.getRow(1);
    const colMap: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      if (cell.value) {
        colMap[String(cell.value).trim()] = colNumber;
      }
    });

    if (!colMap['标题'] || !colMap['文章链接']) {
      return { success: false, error: 'Excel 缺少必需列: 标题、文章链接' };
    }

    // 解析所有行
    const rows: PreviewArticle[] = [];
    for (let i = 2; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      const title = getCellValue(row, colMap['标题']);
      const url = getCellValue(row, colMap['文章链接']);
      if (!title || !url) continue;

      rows.push({
        publishDate: String(getCellValue(row, colMap['发文日期']) || ''),
        accountName: String(getCellValue(row, colMap['公众号']) || ''),
        title: String(title),
        url: String(url),
        readNum: Number(getCellValue(row, colMap['阅读数'])) || 0,
        likeNum: Number(getCellValue(row, colMap['点赞数'])) || 0,
        hotScore: Number(getCellValue(row, colMap['爆文指数'])) || 0,
        isFavorited: String(getCellValue(row, colMap['是否收藏'])) === '是',
      });
    }

    if (rows.length === 0) {
      return { success: false, error: '未解析到有效数据' };
    }

    // 批量保存到数据库
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const details: { title: string; status: string; reason?: string }[] = [];

    for (const art of rows) {
      try {
        const parsed = new URL(art.url);
        const fakeid = parsed.searchParams.get('__biz') || '';
        const mid = parsed.searchParams.get('mid') || '';
        const idx = Number(parsed.searchParams.get('idx')) || 1;

        if (!fakeid || !mid) {
          failed++;
          details.push({ title: art.title, status: 'failed', reason: 'URL 缺少 __biz 或 mid 参数' });
          continue;
        }

        const aid = `${Number(mid)}_${idx}`;

        const existing = getArticleByLink(art.url);
        if (existing) {
          skipped++;
          details.push({ title: art.title, status: 'skipped', reason: '已存在' });
          continue;
        }

        let createTime = Math.floor(Date.now() / 1000);
        if (art.publishDate) {
          const d = new Date(art.publishDate);
          if (!isNaN(d.getTime())) {
            createTime = Math.floor(d.getTime() / 1000);
          }
        }

        const extraFields = JSON.stringify({
          hot_score: art.hotScore,
          source_read_count: art.readNum,
          source_like_count: art.likeNum,
          is_favorited: art.isFavorited,
          source_account_name: art.accountName,
        });

        upsertArticle({
          fakeid,
          aid,
          type: 0,
          title: art.title,
          digest: '',
          cover: '',
          author_name: art.accountName || '--',
          datetime: createTime,
          create_time: createTime,
          link: art.url,
          itemidx: idx,
          _status: 'pending',
          _single: true,
          is_hot: true,
          content_download: false,
          comment_download: false,
          extra_fields: extraFields,
        });

        // 写入 article_metadata 表（阅读数、点赞数等）
        const articleId = getArticleIdByLink(art.url);
        if (articleId) {
          upsertArticleMetadata({
            article_id: articleId,
            read_num: art.readNum,
            old_like_num: art.likeNum,
            download_time: Math.floor(Date.now() / 1000),
          });
        }

        imported++;
        details.push({ title: art.title, status: 'imported' });
      } catch (err) {
        failed++;
        details.push({
          title: art.title,
          status: 'failed',
          reason: err instanceof Error ? err.message : '解析失败',
        });
      }
    }

    // 保存导入记录
    db.prepare(
      'INSERT INTO import_records (file_name, total, imported, skipped, failed, details) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      file?.filename || 'unknown.xlsx',
      rows.length,
      imported,
      skipped,
      failed,
      JSON.stringify(details)
    );

    return {
      success: true,
      data: {
        preview: rows,
        total: rows.length,
        imported,
        skipped,
        failed,
        details,
      },
    };
  } catch (error) {
    console.error('Failed to import hot articles:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

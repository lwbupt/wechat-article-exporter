/**
 * SQLite 数据库连接管理
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件路径，支持通过环境变量配置
const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'wechat.db');
const dataDir = path.dirname(dbPath);

// 确保数据目录存在
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 创建数据库连接
const db = new Database(dbPath);

// 启用 WAL 模式 (Write-Ahead Logging) 提高并发性能
db.pragma('journal_mode = WAL');

// 关闭外键约束（单篇文章下载时 fakeid 可能尚未关联到 mp_accounts）
db.pragma('foreign_keys = OFF');

// 设置同步模式 (NORMAL 平衡性能和安全)
db.pragma('synchronous = NORMAL');

// 设置缓存大小 (10MB)
db.pragma('cache_size = -10000');

// 设置临时存储在内存
db.pragma('temp_store = MEMORY');

/**
 * 初始化数据库表结构
 */
export function initDatabase(): void {
  // 开发环境: process.cwd()/server/database/schema.sql
  // 生产构建: process.cwd()/server/database/schema.sql (Dockerfile 中 COPY)
  const possibleSchemaPaths = [
    path.join(process.cwd(), 'server/database/schema.sql'),
    path.join(__dirname, 'database/schema.sql'),
  ];

  let schemaPath = '';
  for (const p of possibleSchemaPaths) {
    if (fs.existsSync(p)) {
      schemaPath = p;
      break;
    }
  }

  if (!schemaPath) {
    throw new Error(`schema.sql not found. Tried: ${possibleSchemaPaths.join(', ')}`);
  }

  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // 分割 SQL 语句 - 处理包含 BEGIN...END 的触发器
  const statements: string[] = [];
  let currentStatement = '';
  let inTrigger = false;

  const lines = schema.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过空行和注释
    if (!trimmed || trimmed.startsWith('--')) {
      continue;
    }

    currentStatement += line + '\n';

    // 检测 BEGIN/END 块
    if (trimmed.includes('CREATE TRIGGER')) {
      inTrigger = true;
    }

    // 在触发器块中，检测 END
    if (inTrigger && trimmed === 'END;') {
      statements.push(currentStatement);
      currentStatement = '';
      inTrigger = false;
      continue;
    }

    // 普通语句以分号结尾
    if (!inTrigger && trimmed.endsWith(';')) {
      statements.push(currentStatement);
      currentStatement = '';
    }
  }

  // 处理最后一个语句
  if (currentStatement.trim()) {
    statements.push(currentStatement);
  }

  // 执行所有语句
  for (const stmt of statements) {
    try {
      db.exec(stmt);
    } catch (error) {
      console.error('SQL Error:', error);
      console.error('Statement:', stmt);
    }
  }

  // 运行数据库迁移，添加新字段
  runMigrations();

  console.log('Database initialized successfully');
}

/**
 * 运行数据库迁移，添加新字段
 */
function runMigrations(): void {
  try {
    // 检查 articles 表是否有 is_deleted 字段
    const articlesTableInfo = db.pragma('table_info(articles)') as Array<{ name: string }>;
    const articlesColumns = articlesTableInfo.map(col => col.name);

    if (!articlesColumns.includes('is_deleted')) {
      console.log('[Migration] Adding is_deleted column to articles table');
      db.exec('ALTER TABLE articles ADD COLUMN is_deleted BOOLEAN DEFAULT 0');
    }

    if (!articlesColumns.includes('metadata_download')) {
      console.log('[Migration] Adding metadata_download column to articles table');
      db.exec('ALTER TABLE articles ADD COLUMN metadata_download BOOLEAN DEFAULT 0');
    }

    if (!articlesColumns.includes('content_download_time')) {
      console.log('[Migration] Adding content_download_time column to articles table');
      db.exec('ALTER TABLE articles ADD COLUMN content_download_time INTEGER');
    }

    if (!articlesColumns.includes('comment_download_time')) {
      console.log('[Migration] Adding comment_download_time column to articles table');
      db.exec('ALTER TABLE articles ADD COLUMN comment_download_time INTEGER');
    }

    if (!articlesColumns.includes('metadata_download_time')) {
      console.log('[Migration] Adding metadata_download_time column to articles table');
      db.exec('ALTER TABLE articles ADD COLUMN metadata_download_time INTEGER');
    }

    if (!articlesColumns.includes('extra_fields')) {
      console.log('[Migration] Adding extra_fields column to articles table');
      db.exec('ALTER TABLE articles ADD COLUMN extra_fields TEXT');
    }

    if (!articlesColumns.includes('itemidx')) {
      console.log('[Migration] Adding itemidx column to articles table');
      db.exec('ALTER TABLE articles ADD COLUMN itemidx INTEGER DEFAULT 1');
    }

    if (!articlesColumns.includes('is_hot')) {
      console.log('[Migration] Adding is_hot column to articles table');
      db.exec('ALTER TABLE articles ADD COLUMN is_hot BOOLEAN DEFAULT 0');
    }

    // 检查 mp_accounts 表的新字段
    const mpAccountsTableInfo = db.pragma('table_info(mp_accounts)') as Array<{ name: string }>;
    const mpAccountsColumns = mpAccountsTableInfo.map(col => col.name);

    if (!mpAccountsColumns.includes('category')) {
      console.log('[Migration] Adding category column to mp_accounts table');
      db.exec('ALTER TABLE mp_accounts ADD COLUMN category TEXT');
    }

    if (!mpAccountsColumns.includes('is_monitored')) {
      console.log('[Migration] Adding is_monitored column to mp_accounts table');
      db.exec('ALTER TABLE mp_accounts ADD COLUMN is_monitored BOOLEAN DEFAULT 0');
    }

    // 创建 categories 表（如果不存在）
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='categories'")
      .get();
    if (!tables) {
      console.log('[Migration] Creating categories table');
      db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          parent_id INTEGER DEFAULT NULL,
          sort_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      // 插入预定义分类
      const defaultCategories = [
        { name: '科技' },
        { name: '财经' },
        { name: '教育' },
        { name: '健康' },
        { name: '娱乐' },
        { name: '文化' },
        { name: '政治' },
        { name: '生活' },
        { name: '其他' },
      ];
      const insertStmt = db.prepare('INSERT OR IGNORE INTO categories (name, parent_id, sort_order) VALUES (?, ?, ?)');
      for (const cat of defaultCategories) {
        insertStmt.run(cat.name, cat.parent_id, cat.sort_order);
      }

      // 二插入二级分类
      const subCategories = [
        { name: 'AI', parentId: 1 }, // 科技
        { name: '互联网', parentId: 1 },
        { name: '编程', parentId: 1 }, // 科技
        { name: '贷款', parentId: 2 }, // 财经
        { name: '理财', parentId: 2 }, // 财经
        { name: 'K12教育', parentId: 3 }, // 教育
        { name: '医疗健康', parentId: 4 }, // 健康
        { name: '影视音乐', parentId: 5 }, // 娱乐
        { name: '传统文化', parentId: 6 }, // 文化
        { name: '热门美食', parentId: 7 }, // 生活
      ];
      const insertSubStmt = db.prepare('INSERT OR IGNORE INTO categories (name, parent_id, sort_order) VALUES (?, ?, ?)');
      for (const cat of subCategories) {
        insertSubStmt.run(cat.name, cat.parentId, cat.sort_order);
      }
    } else {
      // categories 表已存在，检查是否需要添加 parent_id 和 sort_order 字段
      const columns = (db.pragma('table_info(categories)') as Array<{ name: string }>).map(col => col.name);
      if (!columns.includes('parent_id')) {
        console.log('[Migration] Adding parent_id and sort_order columns to categories table');
        db.exec('ALTER TABLE categories ADD COLUMN parent_id INTEGER DEFAULT NULL');
        db.exec('ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0');

        // 緻加唯一索引
        db.exec('CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id)');
      }

    }

    // 创建 monitor_logs 表（如果不存在）
    const monitorLogsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='monitor_logs'")
      .get();
    if (!monitorLogsTable) {
      console.log('[Migration] Creating monitor_logs table');
      db.exec(`
        CREATE TABLE IF NOT EXISTS monitor_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          fakeid TEXT NOT NULL,
          nickname TEXT,
          avatar TEXT,
          check_time INTEGER NOT NULL,
          new_count INTEGER DEFAULT 0,
          new_titles TEXT,
          error TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // 创建 import_records 表（爆文导入记录）
    const importRecordsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='import_records'")
      .get();
    if (!importRecordsTable) {
      console.log('[Migration] Creating import_records table');
      db.exec(`
        CREATE TABLE IF NOT EXISTS import_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_name TEXT NOT NULL,
          total INTEGER DEFAULT 0,
          imported INTEGER DEFAULT 0,
          skipped INTEGER DEFAULT 0,
          failed INTEGER DEFAULT 0,
          details TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // 检查 article_html 表的字段
    const htmlTableInfo = db.pragma('table_info(article_html)') as Array<{ name: string }>;
    const htmlColumns = htmlTableInfo.map(col => col.name);

    if (!htmlColumns.includes('is_valid')) {
      console.log('[Migration] Adding is_valid column to article_html table');
      db.exec('ALTER TABLE article_html ADD COLUMN is_valid BOOLEAN DEFAULT 1');
    }

    if (!htmlColumns.includes('validation_error')) {
      console.log('[Migration] Adding validation_error column to article_html table');
      db.exec('ALTER TABLE article_html ADD COLUMN validation_error TEXT');
    }

    if (!htmlColumns.includes('created_at')) {
      console.log('[Migration] Adding created_at column to article_html table');
      db.exec('ALTER TABLE article_html ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    }

    if (!htmlColumns.includes('updated_at')) {
      console.log('[Migration] Adding updated_at column to article_html table');
      db.exec('ALTER TABLE article_html ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    }

    // 检查 article_metadata 表的字段
    const metadataTableInfo = db.pragma('table_info(article_metadata)') as Array<{ name: string }>;
    const metadataColumns = metadataTableInfo.map(col => col.name);

    if (!metadataColumns.includes('old_like_num')) {
      console.log('[Migration] Adding old_like_num column to article_metadata table');
      db.exec('ALTER TABLE article_metadata ADD COLUMN old_like_num INTEGER DEFAULT 0');
    }

    if (!metadataColumns.includes('download_time')) {
      console.log('[Migration] Adding download_time column to article_metadata table');
      db.exec('ALTER TABLE article_metadata ADD COLUMN download_time INTEGER');
    }

    if (!metadataColumns.includes('created_at')) {
      console.log('[Migration] Adding created_at column to article_metadata table');
      db.exec('ALTER TABLE article_metadata ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    }

    if (!metadataColumns.includes('updated_at')) {
      console.log('[Migration] Adding updated_at column to article_metadata table');
      db.exec('ALTER TABLE article_metadata ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    }

    // 检查 comments 表的字段
    const commentsTableInfo = db.pragma('table_info(comments)') as Array<{ name: string }>;
    const commentsColumns = commentsTableInfo.map(col => col.name);

    if (!commentsColumns.includes('download_time')) {
      console.log('[Migration] Adding download_time column to comments table');
      db.exec('ALTER TABLE comments ADD COLUMN download_time INTEGER');
    }

    if (!commentsColumns.includes('created_at')) {
      console.log('[Migration] Adding created_at column to comments table');
      db.exec('ALTER TABLE comments ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    }

    if (!commentsColumns.includes('updated_at')) {
      console.log('[Migration] Adding updated_at column to comments table');
      db.exec('ALTER TABLE comments ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    }

    // 检查 comment_replies 表的字段
    const repliesTableInfo = db.pragma('table_info(comment_replies)') as Array<{ name: string }>;
    const repliesColumns = repliesTableInfo.map(col => col.name);

    if (!repliesColumns.includes('download_time')) {
      console.log('[Migration] Adding download_time column to comment_replies table');
      db.exec('ALTER TABLE comment_replies ADD COLUMN download_time INTEGER');
    }

    if (!repliesColumns.includes('created_at')) {
      console.log('[Migration] Adding created_at column to comment_replies table');
      db.exec('ALTER TABLE comment_replies ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    }

    if (!repliesColumns.includes('updated_at')) {
      console.log('[Migration] Adding updated_at column to comment_replies table');
      db.exec('ALTER TABLE comment_replies ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    }

    // 创建新索引（如果不存在）
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all() as Array<{ name: string }>;
    const existingIndexes = new Set(indexes.map(idx => idx.name));

    const newIndexes = [
      'idx_articles_status',
      'idx_articles_is_deleted',
      'idx_articles_content_download',
      'idx_articles_comment_download',
      'idx_articles_metadata_download',
      'idx_articles_link',
      'idx_comments_download_time',
    ];

    for (const indexName of newIndexes) {
      if (!existingIndexes.has(indexName)) {
        console.log(`[Migration] Creating index ${indexName}`);
        try {
          if (indexName === 'idx_articles_status') {
            db.exec('CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(_status)');
          } else if (indexName === 'idx_articles_is_deleted') {
            db.exec('CREATE INDEX IF NOT EXISTS idx_articles_is_deleted ON articles(is_deleted)');
          } else if (indexName === 'idx_articles_content_download') {
            db.exec('CREATE INDEX IF NOT EXISTS idx_articles_content_download ON articles(content_download)');
          } else if (indexName === 'idx_articles_comment_download') {
            db.exec('CREATE INDEX IF NOT EXISTS idx_articles_comment_download ON articles(comment_download)');
          } else if (indexName === 'idx_articles_metadata_download') {
            db.exec('CREATE INDEX IF NOT EXISTS idx_articles_metadata_download ON articles(metadata_download)');
          } else if (indexName === 'idx_articles_link') {
            db.exec('CREATE INDEX IF NOT EXISTS idx_articles_link ON articles(link)');
          } else if (indexName === 'idx_comments_download_time') {
            db.exec('CREATE INDEX IF NOT EXISTS idx_comments_download_time ON comments(download_time)');
          }
        } catch (error) {
          console.error(`Failed to create index ${indexName}:`, error);
        }
      }
    }

    // 修复所有公众号的 articles 字段（统计实际文章数量）
    console.log('[Migration] Fixing articles count for all accounts');
    db.exec(`
      UPDATE mp_accounts
      SET articles = (
        SELECT COUNT(*) FROM articles
        WHERE articles.fakeid = mp_accounts.fakeid
      )
    `);

    // 修复所有公众号的 count 字段（基于 itemidx = 1 统计消息数）
    // 如果所有文章的 itemidx 都是默认值 1，则 count = articles
    console.log('[Migration] Fixing count for all accounts');
    db.exec(`
      UPDATE mp_accounts
      SET count = (
        SELECT COUNT(DISTINCT CASE WHEN itemidx = 1 THEN aid END) FROM articles
        WHERE articles.fakeid = mp_accounts.fakeid
      )
    `);

    console.log('Database migrations completed');
  } catch (error) {
    console.error('Migration error:', error);
  }
}

/**
 * 获取数据库版本
 */
export function getDatabaseVersion(): string {
  const result = db.prepare('SELECT sqlite_version() as version').get() as { version: string };
  return result.version;
}

/**
 * 获取数据库统计信息
 */
export function getDatabaseStats(): Record<string, number> {
  const stats = {
    version: getDatabaseVersion(),
    mp_accounts: db.prepare('SELECT COUNT(*) as count FROM mp_accounts').get() as { count: number },
    articles: db.prepare('SELECT COUNT(*) as count FROM articles').get() as { count: number },
    comments: db.prepare('SELECT COUNT(*) as count FROM comments').get() as { count: number },
    assets: db.prepare('SELECT COUNT(*) as count FROM assets').get() as { count: number },
  };
  return stats;
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  db.close();
}

// 导出数据库实例
export default db;

// 初始化数据库（在模块加载时执行）
try {
  initDatabase();
} catch (error) {
  console.error('Failed to initialize database:', error);
}

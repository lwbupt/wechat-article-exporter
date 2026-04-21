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

    // categories 表增加配图配置字段
    const catCols = (db.pragma('table_info(categories)') as Array<{ name: string }>).map(col => col.name);
    if (!catCols.includes('image_mode')) {
      console.log('[Migration] Adding image config columns to categories table');
      db.exec("ALTER TABLE categories ADD COLUMN image_mode TEXT DEFAULT 'search'");
      db.exec('ALTER TABLE categories ADD COLUMN image_count INTEGER DEFAULT 2');
      db.exec("ALTER TABLE categories ADD COLUMN image_config TEXT DEFAULT '{}'");
    }

    if (!catCols.includes('image_source')) {
      console.log('[Migration] Adding image_source column to categories table');
      db.exec("ALTER TABLE categories ADD COLUMN image_source TEXT DEFAULT 'free_search'");
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

    // 创建 article_analysis 表（爆文解析记录）
    const analysisTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='article_analysis'")
      .get();
    if (!analysisTable) {
      console.log('[Migration] Creating article_analysis table');
      db.exec(`
        CREATE TABLE IF NOT EXISTS article_analysis (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT NOT NULL,
          title TEXT,
          title_analysis TEXT,
          structure_analysis TEXT,
          writing_techniques TEXT,
          reusable_template TEXT,
          viral_elements TEXT,
          golden_sentences TEXT,
          summary TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_article_analysis_url ON article_analysis(url)');
    } else {
      // article_analysis 表已存在，检查是否需要添加 category 列
      const analysisColumns = (db.pragma('table_info(article_analysis)') as Array<{ name: string }>).map(col => col.name);
      if (!analysisColumns.includes('category')) {
        console.log('[Migration] Adding category column to article_analysis table');
        db.exec('ALTER TABLE article_analysis ADD COLUMN category TEXT');
      }
    }

    // 创建 settings 表（键值配置存储）
    const settingsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
      .get();
    if (!settingsTable) {
      console.log('[Migration] Creating settings table');
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 插入默认爆文解析提示词
      const defaultPrompt = `你是一位资深的微信公众号爆文分析专家。请对给定的文章内容进行深度分析，从以下维度输出分析结果。

用户会在文章内容前附带【分类范围】，你需从中选择最匹配的分类填入 category 字段。

请严格按以下 JSON 格式输出，不要包含任何其他内容：
{
  "category": "从【分类范围】中选择最匹配的一个分类",
  "titleAnalysis": "标题分析：分析标题的吸引力、用词技巧、情绪触发点",
  "structureAnalysis": "结构分析：分析文章的整体结构、段落安排、逻辑递进",
  "writingTechniques": "写作手法：分析使用的修辞手法、叙事技巧、表达方式",
  "reusableTemplate": "可复用模板：提炼出可复用的文章框架或模板",
  "viralElements": "爆款要素：分析文章的传播要素、情绪价值、社交货币属性",
  "goldenSentences": "金句摘录：摘录文章中最有传播力的金句，每句一行",
  "summary": "总结评价：对文章整体质量的综合评价和爆款指数"
}`;

      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('analysis_prompt', defaultPrompt);
    }

    // 创建 managed_accounts 表（公众号运营）
    const managedTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='managed_accounts'")
      .get();
    if (!managedTable) {
      console.log('[Migration] Creating managed_accounts table');
      db.exec(`
        CREATE TABLE IF NOT EXISTS managed_accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          appid TEXT,
          secret TEXT,
          description TEXT,
          category TEXT,
          persona TEXT,
          enabled BOOLEAN DEFAULT 0,
          ext1 TEXT,
          ext2 TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // 创建 daily_topics 表（每日话题）
    const dailyTopicsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='daily_topics'")
      .get();
    if (!dailyTopicsTable) {
      console.log('[Migration] Creating daily_topics table');
      db.exec(`
        CREATE TABLE IF NOT EXISTS daily_topics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_date TEXT NOT NULL,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          angle TEXT,
          viral_point TEXT,
          email_subject TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_daily_topics_date ON daily_topics(topic_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_daily_topics_category ON daily_topics(category)');
    }

    // 创建 topic_materials 表（选题素材）
    const materialsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='topic_materials'")
      .get();
    if (!materialsTable) {
      console.log('[Migration] Creating topic_materials table');
      db.exec(`
        CREATE TABLE IF NOT EXISTS topic_materials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_id INTEGER NOT NULL,
          source TEXT NOT NULL,
          title TEXT,
          content TEXT,
          url TEXT,
          category TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_topic_materials_topic ON topic_materials(topic_id)');
    }

    // 创建 generated_articles 表（生成的备选文章）
    const genArticlesTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='generated_articles'")
      .get();
    if (!genArticlesTable) {
      console.log('[Migration] Creating generated_articles table');
      db.exec(`
        CREATE TABLE IF NOT EXISTS generated_articles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_id INTEGER,
          account_id INTEGER,
          title TEXT NOT NULL,
          outline TEXT,
          content TEXT NOT NULL,
          category TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_gen_articles_topic ON generated_articles(topic_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_gen_articles_created ON generated_articles(created_at)');
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

    // 回填缺失的 author_name：用同一公众号下已知作者名填充
    console.log('[Migration] Backfilling missing author_name');
    db.exec(`
      UPDATE articles SET author_name = (
        SELECT a2.author_name FROM articles a2
        WHERE a2.fakeid = articles.fakeid AND a2.author_name IS NOT NULL AND a2.author_name != ''
        LIMIT 1
      )
      WHERE (author_name IS NULL OR author_name = '')
    `);

    // ===== 内容生成：配图/排版/发布 相关迁移 =====

    // generated_articles 新增列
    const genTableInfo = db.pragma('table_info(generated_articles)') as Array<{ name: string }>;
    const genColumns = genTableInfo.map(col => col.name);

    if (!genColumns.includes('content_with_images')) {
      console.log('[Migration] Adding content_with_images column to generated_articles');
      db.exec('ALTER TABLE generated_articles ADD COLUMN content_with_images TEXT');
    }
    if (!genColumns.includes('formatted_html')) {
      console.log('[Migration] Adding formatted_html column to generated_articles');
      db.exec('ALTER TABLE generated_articles ADD COLUMN formatted_html TEXT');
    }
    if (!genColumns.includes('layout_template')) {
      console.log('[Migration] Adding layout_template column to generated_articles');
      db.exec('ALTER TABLE generated_articles ADD COLUMN layout_template TEXT');
    }
    if (!genColumns.includes('publish_status')) {
      console.log('[Migration] Adding publish_status column to generated_articles');
      db.exec("ALTER TABLE generated_articles ADD COLUMN publish_status TEXT DEFAULT 'draft'");
    }

    // 新建 article_images 表
    const imgTableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='article_images'")
      .get();
    if (!imgTableExists) {
      console.log('[Migration] Creating article_images table');
      db.exec(`
        CREATE TABLE IF NOT EXISTS article_images (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          article_id INTEGER NOT NULL,
          original_url TEXT NOT NULL,
          hosted_url TEXT,
          thumbnail_url TEXT,
          alt_text TEXT,
          source TEXT DEFAULT 'unsplash',
          position TEXT DEFAULT 'inline',
          sort_order INTEGER DEFAULT 0,
          width INTEGER,
          height INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_article_images_article ON article_images(article_id)');
    }

    // 新建 layout_templates 表 + 默认模板
    const tplTableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='layout_templates'")
      .get();
    if (!tplTableExists) {
      console.log('[Migration] Creating layout_templates table');
      db.exec(`
        CREATE TABLE IF NOT EXISTS layout_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          style_json TEXT NOT NULL,
          is_default BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // 模板数据（升级后的完整格式，含 colors/darkmode/全元素样式）
    const allTemplates = [
      // ========== 原有 4 个模板（升级格式） ==========
      {
        name: '简约白',
        description: '简洁干净，适合大多数文章',
        is_default: 1,
        style_json: JSON.stringify({
          container: "max-width: 578px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333;",
          h1: 'font-size: 22px; font-weight: bold; color: #333; text-align: center; margin: 0 0 20px 0; line-height: 1.4;',
          h2: 'font-size: 18px; font-weight: bold; color: #1a1a1a; margin: 25px 0 15px 0; line-height: 1.5;',
          h2_decoration: 'border-bottom: 2px solid #1a1a1a; padding-bottom: 8px;',
          h3: 'font-size: 16px; font-weight: bold; color: #333; margin: 20px 0 10px 0; line-height: 1.5;',
          h3_decoration: 'border-left: 3px solid #1a73e8; padding-left: 10px;',
          h4: 'font-size: 15px; font-weight: bold; color: #555; margin: 18px 0 10px 0; line-height: 1.5;',
          p: 'font-size: 16px; line-height: 1.8; color: #555; margin: 0 0 15px 0; text-indent: 2em;',
          strong: 'font-weight: 700; color: #1a1a1a;',
          em: 'font-style: italic; color: #333;',
          code: 'font-family: Consolas, Monaco, monospace; font-size: 14px; background: #f5f5f5; color: #d63384; padding: 2px 6px; border-radius: 3px;',
          pre: 'background: #f8f9fa; color: #333; padding: 16px; border-radius: 8px; margin: 16px 0; line-height: 1.6; overflow-x: auto;',
          blockquote: 'border-left: 3px solid #ddd; padding: 10px 15px; color: #888; background: #fafafa; margin: 15px 0; font-size: 15px; line-height: 1.7;',
          list: 'font-size: 16px; line-height: 1.8; color: #555; margin: 10px 0; padding-left: 2em;',
          image: 'max-width: 100%; border-radius: 4px; margin: 15px auto; display: block;',
          table: 'width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 15px;',
          th: 'background: #f5f5f5; font-weight: 600; padding: 10px 14px; text-align: left; border: 1px solid #e5e5e5;',
          td: 'padding: 10px 14px; border: 1px solid #e5e5e5; color: #555;',
          a: 'color: #1a73e8; text-decoration: none;',
          hr: 'border: none; border-top: 1px solid #ddd; margin: 20px 0;',
          separator: '<section style="text-align: center; margin: 24px 0; color: #ccc; font-size: 14px; letter-spacing: 8px;">· · ·</section>',
          header_content: '<section style="padding: 12px 0; margin-bottom: 16px; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #999; text-align: center;">深耕原创 · 只为品质阅读</section>',
          footer_content: '<section style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;"><p style="font-size: 14px; color: #888; text-align: center; margin: 0 0 8px 0;">觉得有用？<strong style="color: #1a73e8;">点赞</strong> · <strong style="color: #1a73e8;">收藏</strong> · <strong style="color: #1a73e8;">转发</strong> 三连支持</p><p style="font-size: 12px; color: #bbb; text-align: center; margin: 0;">关注我，获取更多优质内容</p></section>',
          colors: { primary: '#1a1a1a', text: '#555555', background: '#ffffff', code_bg: '#f8f9fa', code_color: '#d63384' },
          darkmode: { text: '#c8c8c8', background: '#1e1e1e', primary: '#e0e0e0', code_bg: '#2d2d2d', code_color: '#d4d4d4', quote_bg: '#252525' },
        }),
      },
      {
        name: '科技蓝',
        description: '蓝色主题，适合科技互联网类文章',
        is_default: 0,
        style_json: JSON.stringify({
          container: "max-width: 578px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333;",
          h1: 'font-size: 22px; font-weight: bold; color: #1a73e8; text-align: center; margin: 0 0 20px 0; line-height: 1.4;',
          h2: 'font-size: 18px; font-weight: bold; color: #1a73e8; border-left: 4px solid #1a73e8; padding-left: 12px; margin: 25px 0 15px 0; line-height: 1.5;',
          h3: 'font-size: 16px; font-weight: 600; color: #1a73e8; margin: 20px 0 10px 0; line-height: 1.5;',
          h3_decoration: 'border-bottom: 1px dashed #93c5fd; padding-bottom: 4px;',
          h4: 'font-size: 15px; font-weight: 600; color: #444; margin: 18px 0 10px 0; line-height: 1.5;',
          p: 'font-size: 16px; line-height: 1.8; color: #444; margin: 0 0 15px 0; text-indent: 2em;',
          strong: 'font-weight: 700; color: #1a73e8;',
          em: 'font-style: italic; color: #333;',
          code: 'font-family: Consolas, Monaco, monospace; font-size: 14px; background: #f0f6ff; color: #1a73e8; padding: 2px 6px; border-radius: 3px;',
          pre: 'background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; margin: 16px 0; line-height: 1.6; overflow-x: auto;',
          blockquote: 'border-left: 3px solid #1a73e8; padding: 10px 15px; color: #555; background: #f0f6ff; margin: 15px 0; font-size: 15px; line-height: 1.7;',
          list: 'font-size: 16px; line-height: 1.8; color: #444; margin: 10px 0; padding-left: 2em;',
          image: 'max-width: 100%; border-radius: 8px; margin: 15px auto; display: block; box-shadow: 0 2px 8px rgba(0,0,0,0.1);',
          table: 'width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 15px;',
          th: 'background: #1a73e8; color: #fff; font-weight: 600; padding: 10px 14px; text-align: left; border: 1px solid #1a73e8;',
          td: 'padding: 10px 14px; border: 1px solid #e5e7eb; color: #444;',
          a: 'color: #1a73e8; text-decoration: none; font-weight: 500;',
          hr: 'border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;',
          separator: '<section style="text-align: center; margin: 24px 0;"><span style="display: inline-block; width: 30px; height: 3px; background: #1a73e8; border-radius: 2px; margin: 0 4px;"></span><span style="display: inline-block; width: 30px; height: 3px; background: #93c5fd; border-radius: 2px; margin: 0 4px;"></span><span style="display: inline-block; width: 30px; height: 3px; background: #1a73e8; border-radius: 2px; margin: 0 4px;"></span></section>',
          footer_content: '<section style="margin-top: 30px; padding: 16px; background: #f0f6ff; border-radius: 8px; text-align: center;"><p style="font-size: 14px; color: #1a73e8; margin: 0 0 6px 0; font-weight: 600;">科技前沿 · 深度解读</p><p style="font-size: 13px; color: #6b7280; margin: 0 0 8px 0;">如果觉得有收获，点赞收藏转发支持一下</p><p style="font-size: 12px; color: #9ca3af; margin: 0;">关注我，持续获取科技资讯与深度分析</p></section>',
          colors: { primary: '#1a73e8', text: '#444444', background: '#ffffff', code_bg: '#1e293b', code_color: '#e2e8f0' },
          darkmode: { text: '#c8c8c8', background: '#1e1e1e', primary: '#6aadff', code_bg: '#2d2d2d', code_color: '#d4d4d4', quote_bg: '#1a2540' },
        }),
      },
      {
        name: '文艺清新',
        description: '柔和配色，适合生活情感类文章',
        is_default: 0,
        style_json: JSON.stringify({
          container: "max-width: 578px; margin: 0 auto; padding: 20px; font-family: 'Georgia', 'Noto Serif SC', serif; color: #333;",
          h1: 'font-size: 22px; font-weight: bold; color: #c0392b; text-align: center; margin: 0 0 20px 0; line-height: 1.4; letter-spacing: 2px;',
          h1_decoration: 'border-bottom: 1px solid #e8c8a0; padding-bottom: 10px;',
          h2: 'font-size: 18px; font-weight: bold; color: #8e6e53; margin: 25px 0 15px 0; line-height: 1.5;',
          h2_decoration: 'border-left: 3px solid #c0392b; padding-left: 10px;',
          h3: 'font-size: 16px; font-weight: 600; color: #8e6e53; margin: 20px 0 10px 0; line-height: 1.5;',
          h4: 'font-size: 15px; font-weight: 600; color: #8e6e53; margin: 18px 0 10px 0; line-height: 1.5;',
          p: 'font-size: 16px; line-height: 2; color: #555; margin: 0 0 15px 0; text-indent: 2em;',
          strong: 'font-weight: 700; color: #8e6e53;',
          em: 'font-style: italic; color: #8e6e53;',
          code: 'font-family: Consolas, Monaco, monospace; font-size: 14px; background: #fdf8f0; color: #8e6e53; padding: 2px 6px; border-radius: 3px;',
          pre: 'background: #fdf8f0; color: #555; padding: 16px; border-radius: 8px; margin: 16px 0; line-height: 1.6; overflow-x: auto;',
          blockquote: 'border-left: 3px solid #e8c8a0; padding: 12px 15px; color: #8e6e53; background: #fdf8f0; margin: 15px 0; font-size: 15px; line-height: 1.8; font-style: italic;',
          list: 'font-size: 16px; line-height: 2; color: #555; margin: 10px 0; padding-left: 2em;',
          image: 'max-width: 100%; border-radius: 12px; margin: 15px auto; display: block;',
          table: 'width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 15px;',
          th: 'background: #fdf8f0; font-weight: 600; color: #8e6e53; padding: 10px 14px; text-align: left; border: 1px solid #e8c8a0;',
          td: 'padding: 10px 14px; border: 1px solid #e8c8a0; color: #555;',
          a: 'color: #c0392b; text-decoration: none;',
          hr: 'border: none; border-top: 1px solid #e8c8a0; margin: 20px 0;',
          separator: '<section style="text-align: center; margin: 24px 0; color: #e8c8a0; font-size: 16px;">～ ✿ ～</section>',
          header_content: '<section style="text-align: center; margin-bottom: 20px; font-size: 13px; color: #b09070;"><span style="margin: 0 8px;">🌿</span>生活美学 · 温暖文字<span style="margin: 0 8px;">🌿</span></section>',
          footer_content: '<section style="margin-top: 30px; padding: 20px 0; border-top: 1px dashed #e8c8a0; text-align: center;"><p style="font-size: 15px; color: #8e6e53; margin: 0 0 6px 0;">愿文字温暖你的每一天 ✨</p><p style="font-size: 13px; color: #b09070; margin: 0 0 8px 0;">喜欢就点个<strong style="color: #c0392b;">赞</strong>，收藏起来慢慢读</p><p style="font-size: 12px; color: #ccc; margin: 0;">长按关注 · 不负遇见</p></section>',
          colors: { primary: '#8e6e53', text: '#555555', background: '#ffffff', code_bg: '#fdf8f0', code_color: '#8e6e53' },
          darkmode: { text: '#d4c4b0', background: '#1e1e1e', primary: '#d4a574', code_bg: '#2d2d2d', code_color: '#d4c4b0', quote_bg: '#252018' },
        }),
      },
      {
        name: '商务专业',
        description: '沉稳大气，适合商业财经类文章',
        is_default: 0,
        style_json: JSON.stringify({
          container: "max-width: 578px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333;",
          h1: 'font-size: 22px; font-weight: bold; color: #2c3e50; text-align: center; margin: 0 0 20px 0; line-height: 1.4; border-bottom: 2px solid #2c3e50; padding-bottom: 10px;',
          h2: 'font-size: 18px; font-weight: bold; color: #2c3e50; margin: 25px 0 15px 0; line-height: 1.5; border-bottom: 1px solid #eee; padding-bottom: 5px;',
          h3: 'font-size: 16px; font-weight: 600; color: #2c3e50; margin: 20px 0 10px 0; line-height: 1.5;',
          h4: 'font-size: 15px; font-weight: 600; color: #2c3e50; margin: 18px 0 10px 0; line-height: 1.5;',
          p: 'font-size: 16px; line-height: 1.8; color: #444; margin: 0 0 15px 0; text-indent: 2em;',
          strong: 'font-weight: 700; color: #2c3e50;',
          em: 'font-style: italic; color: #555;',
          code: 'font-family: Consolas, Monaco, monospace; font-size: 14px; background: #f8f9fa; color: #2c3e50; padding: 2px 6px; border-radius: 3px;',
          pre: 'background: #f8f9fa; color: #2c3e50; padding: 16px; border-radius: 4px; margin: 16px 0; line-height: 1.6; overflow-x: auto;',
          blockquote: 'border-left: 3px solid #2c3e50; padding: 10px 15px; color: #555; background: #f8f9fa; margin: 15px 0; font-size: 15px; line-height: 1.7;',
          list: 'font-size: 16px; line-height: 1.8; color: #444; margin: 10px 0; padding-left: 2em;',
          image: 'max-width: 100%; margin: 15px auto; display: block;',
          table: 'width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 15px;',
          th: 'background: #2c3e50; color: #fff; font-weight: 600; padding: 10px 14px; text-align: left; border: 1px solid #2c3e50;',
          td: 'padding: 10px 14px; border: 1px solid #e5e7eb; color: #444;',
          a: 'color: #2c3e50; text-decoration: none; font-weight: 500;',
          hr: 'border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;',
          colors: { primary: '#2c3e50', text: '#444444', background: '#ffffff', code_bg: '#f8f9fa', code_color: '#2c3e50' },
          darkmode: { text: '#c8c8c8', background: '#1e1e1e', primary: '#8faabe', code_bg: '#2d2d2d', code_color: '#d4d4d4', quote_bg: '#252525' },
        }),
      },
      // ========== 新增 6 个 wewrite 主题 ==========
      {
        name: 'GitHub',
        description: 'GitHub 风格，适合技术文档和开发者内容',
        is_default: 0,
        style_json: JSON.stringify({
          container: "max-width: 578px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2328;",
          h1: 'font-size: 26px; font-weight: 700; color: #1f2328; margin: 32px 0 16px 0; padding-bottom: 12px; border-bottom: 1px solid #d1d9e0; line-height: 1.4;',
          h2: 'font-size: 22px; font-weight: 700; color: #1f2328; margin: 28px 0 14px 0; padding-bottom: 8px; border-bottom: 1px solid #d1d9e0; line-height: 1.4;',
          h3: 'font-size: 18px; font-weight: 600; color: #1f2328; margin: 24px 0 12px 0; line-height: 1.4;',
          h4: 'font-size: 16px; font-weight: 600; color: #1f2328; margin: 20px 0 10px 0; line-height: 1.4;',
          p: 'font-size: 16px; line-height: 1.75; color: #1f2328; margin: 12px 0;',
          strong: 'font-weight: 700; color: #1f2328;',
          em: 'font-style: italic; color: #1f2328;',
          code: 'font-family: SFMono-Regular, Consolas, monospace; font-size: 14px; background: #f6f8fa; color: #0550ae; padding: 2px 6px; border-radius: 4px;',
          pre: 'background: #f6f8fa; color: #1f2328; padding: 16px; border-radius: 8px; margin: 16px 0; line-height: 1.6; overflow-x: auto;',
          blockquote: 'border-left: 4px solid #0969da; padding: 12px 16px; color: #656d76; background: #f6f8fa; margin: 16px 0; border-radius: 0 8px 8px 0;',
          list: 'font-size: 16px; line-height: 1.75; color: #1f2328; margin: 12px 0; padding-left: 24px;',
          image: 'max-width: 100%; height: auto; display: block; margin: 24px auto; border-radius: 8px;',
          table: 'width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 15px;',
          th: 'background: #f6f8fa; font-weight: 600; color: #1f2328; padding: 10px 14px; text-align: left; border: 1px solid #d1d9e0;',
          td: 'padding: 10px 14px; border: 1px solid #d1d9e0; color: #1f2328;',
          a: 'color: #0969da; text-decoration: none; font-weight: 500;',
          hr: 'border: none; border-top: 1px solid #d1d9e0; margin: 24px 0;',
          colors: { primary: '#0969da', text: '#1f2328', background: '#ffffff', code_bg: '#f6f8fa', code_color: '#0550ae' },
          darkmode: { text: '#e6edf3', background: '#0d1117', primary: '#58a6ff', code_bg: '#161b22', code_color: '#e6edf3', quote_bg: '#161b22' },
        }),
      },
      {
        name: '水墨中国风',
        description: '宣纸底墨色文字，适合文化和人文内容',
        is_default: 0,
        style_json: JSON.stringify({
          container: "max-width: 578px; margin: 0 auto; padding: 20px; font-family: 'Noto Serif SC', 'Source Han Serif SC', 'SimSun', serif; color: #1a1a1a; background: #f8f5f0;",
          h1: 'font-size: 26px; font-weight: 700; color: #1a1a1a; text-align: center; margin: 32px 0 20px 0; letter-spacing: 4px; line-height: 1.4;',
          h1_decoration: 'border-bottom: 2px solid #8b0000; padding-bottom: 12px;',
          h2: 'font-size: 20px; font-weight: 700; color: #1a1a1a; text-align: center; margin: 28px 0 14px 0; letter-spacing: 2px; line-height: 1.4;',
          h2_decoration: 'border-top: 1px solid #d4cfc7; border-bottom: 1px solid #d4cfc7; padding: 8px 0;',
          h3: 'font-size: 18px; font-weight: 600; color: #4a4a4a; margin: 24px 0 12px 0; letter-spacing: 1px; line-height: 1.4;',
          h3_decoration: 'border-left: 3px solid #8b0000; padding-left: 12px;',
          h4: 'font-size: 16px; font-weight: 600; color: #4a4a4a; margin: 20px 0 10px 0; line-height: 1.4;',
          p: 'font-size: 16px; line-height: 2; color: #1a1a1a; margin: 12px 0; text-indent: 2em;',
          strong: 'font-weight: 700; color: #1a1a1a;',
          em: 'font-style: italic; color: #4a4a4a;',
          code: 'font-family: SFMono-Regular, Consolas, monospace; font-size: 14px; background: #f0ebe3; color: #555; padding: 2px 6px; border-radius: 3px;',
          pre: 'background: #f0ebe3; color: #333; padding: 16px; border-radius: 4px; margin: 16px 0; line-height: 1.6; overflow-x: auto;',
          blockquote: 'border-left: 3px solid #4a4a4a; padding: 12px 16px; color: #4a4a4a; background: #f0ebe3; margin: 16px 0; font-style: italic; line-height: 1.8;',
          list: 'font-size: 16px; line-height: 2; color: #1a1a1a; margin: 12px 0; padding-left: 24px;',
          image: 'max-width: 100%; height: auto; display: block; margin: 24px auto;',
          table: 'width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 15px;',
          th: 'background: #f0ebe3; font-weight: 600; color: #1a1a1a; padding: 10px 14px; text-align: left; border: 1px solid #d4cfc7;',
          td: 'padding: 10px 14px; border: 1px solid #d4cfc7; color: #1a1a1a;',
          a: 'color: #4a4a4a; text-decoration: none; border-bottom: 1px solid #4a4a4a;',
          hr: 'border: none; border-top: 1px solid #d4cfc7; margin: 24px 0;',
          separator: '<section style="text-align: center; margin: 24px 0; color: #8b0000; font-size: 18px; letter-spacing: 12px;">◆ ◆ ◆</section>',
          header_content: '<section style="text-align: center; margin-bottom: 20px;"><span style="font-size: 20px; color: #8b0000;">墨</span><span style="font-size: 12px; color: #999; margin: 0 6px;">·</span><span style="font-size: 14px; color: #666;">笔落惊风雨</span></section>',
          footer_content: '<section style="margin-top: 30px; padding-top: 16px; border-top: 1px solid #d4cfc7; text-align: center;"><p style="font-size: 14px; color: #4a4a4a; margin: 0 0 6px 0;">落笔成文，愿与君共赏</p><p style="font-size: 13px; color: #888; margin: 0 0 8px 0;">如有共鸣，<strong style="color: #8b0000;">点赞</strong> · <strong style="color: #8b0000;">在看</strong> · <strong style="color: #8b0000;">转发</strong></p><p style="font-size: 12px; color: #bbb; margin: 0;">—— 传承文化，以文会友 ——</p></section>',
          colors: { primary: '#4a4a4a', text: '#1a1a1a', background: '#f8f5f0', code_bg: '#f0ebe3', code_color: '#555555' },
          darkmode: { text: '#d4cfc7', background: '#1a1818', primary: '#a09888', code_bg: '#2d2828', code_color: '#d4cfc7', quote_bg: '#252020' },
        }),
      },
      {
        name: '包豪斯',
        description: '几何感强烈，红蓝黄点缀，适合设计艺术内容',
        is_default: 0,
        style_json: JSON.stringify({
          container: "max-width: 578px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a;",
          h1: 'font-size: 28px; font-weight: 900; color: #1a1a1a; text-transform: uppercase; margin: 32px 0 16px 0; letter-spacing: 3px; line-height: 1.3;',
          h2: 'font-size: 22px; font-weight: 700; color: #e63226; border-left: 6px solid #004592; padding-left: 14px; margin: 28px 0 14px 0; line-height: 1.4;',
          h3: 'font-size: 18px; font-weight: 700; color: #004592; margin: 24px 0 12px 0; line-height: 1.4;',
          h4: 'font-size: 16px; font-weight: 700; color: #f4c430; margin: 20px 0 10px 0; line-height: 1.4; text-transform: uppercase;',
          p: 'font-size: 16px; line-height: 1.8; color: #1a1a1a; margin: 12px 0;',
          strong: 'font-weight: 700; color: #e63226;',
          em: 'font-style: italic; color: #004592;',
          code: 'font-family: SFMono-Regular, Consolas, monospace; font-size: 14px; background: #f0f0f0; color: #004592; padding: 2px 6px; border-radius: 0;',
          pre: 'background: #1a1a1a; color: #f4c430; padding: 16px; margin: 16px 0; line-height: 1.6; overflow-x: auto;',
          blockquote: 'border-left: 6px solid #e63226; padding: 12px 16px; color: #1a1a1a; background: #f4c430; margin: 16px 0; font-weight: 700;',
          list: 'font-size: 16px; line-height: 1.8; color: #1a1a1a; margin: 12px 0; padding-left: 24px;',
          image: 'max-width: 100%; height: auto; display: block; margin: 24px auto; border: 3px solid #1a1a1a;',
          table: 'width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 15px;',
          th: 'background: #1a1a1a; color: #fff; font-weight: 700; padding: 10px 14px; text-align: left; border: 2px solid #1a1a1a; text-transform: uppercase;',
          td: 'padding: 10px 14px; border: 2px solid #1a1a1a; color: #1a1a1a;',
          a: 'color: #004592; text-decoration: none; font-weight: 700; border-bottom: 2px solid #e63226;',
          hr: 'border: none; border-top: 3px solid #1a1a1a; margin: 24px 0;',
          colors: { primary: '#e63226', text: '#1a1a1a', background: '#ffffff', code_bg: '#1a1a1a', code_color: '#f4c430' },
          darkmode: { text: '#e0e0e0', background: '#1a1a1a', primary: '#ff4438', code_bg: '#2d2d2d', code_color: '#f4c430', quote_bg: '#2d2d2d' },
        }),
      },
      {
        name: '字节跳动',
        description: '品牌蓝现代风格，适合科技产品内容',
        is_default: 0,
        style_json: JSON.stringify({
          container: "max-width: 578px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2329; letter-spacing: 0.3px;",
          h1: 'font-size: 24px; font-weight: 700; color: #1f2329; text-align: center; margin: 32px 0 20px 0; padding-bottom: 12px; border-bottom: 3px solid #1966FF; line-height: 1.4;',
          h2: 'font-size: 20px; font-weight: 700; color: #1f2329; margin: 28px 0 14px 0; padding-left: 14px; border-left: 4px solid #1966FF; line-height: 1.4;',
          h3: 'font-size: 17px; font-weight: 600; color: #1f2329; margin: 24px 0 12px 0; line-height: 1.4;',
          h4: 'font-size: 15px; font-weight: 600; color: #1f2329; margin: 20px 0 10px 0; line-height: 1.4;',
          p: 'font-size: 16px; line-height: 1.8; color: #1f2329; margin: 12px 0;',
          strong: 'font-weight: 700; color: #1966FF;',
          em: 'font-style: italic; color: #1f2329;',
          code: 'font-family: SFMono-Regular, Consolas, monospace; font-size: 14px; background: #f5f6f7; color: #1966FF; padding: 2px 6px; border-radius: 4px;',
          pre: 'background: #1e293b; color: #e2e8f0; padding: 20px; border-radius: 8px; margin: 16px 0; line-height: 1.6; overflow-x: auto;',
          blockquote: 'border-left: 4px solid #1966FF; padding: 12px 16px; color: #646a73; background: #f5f6f7; margin: 16px 0; border-radius: 0 8px 8px 0;',
          list: 'font-size: 16px; line-height: 1.8; color: #1f2329; margin: 12px 0; padding-left: 24px;',
          image: 'max-width: 100%; height: auto; display: block; margin: 24px auto; border-radius: 8px;',
          table: 'width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 15px;',
          th: 'background: #1966FF; color: #fff; font-weight: 600; padding: 10px 14px; text-align: left; border: 1px solid #1966FF;',
          td: 'padding: 10px 14px; border: 1px solid #e5e7eb; color: #1f2329;',
          a: 'color: #1966FF; text-decoration: none; font-weight: 500;',
          hr: 'border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;',
          colors: { primary: '#1966FF', text: '#1f2329', background: '#ffffff', code_bg: '#1e293b', code_color: '#e2e8f0' },
          darkmode: { text: '#c8c8c8', background: '#1e1e1e', primary: '#4e8fff', code_bg: '#2d2d2d', code_color: '#d4d4d4', quote_bg: '#252525' },
        }),
      },
      {
        name: '优雅玫瑰',
        description: '浅粉底玫瑰色点缀，适合女性生活和时尚内容',
        is_default: 0,
        style_json: JSON.stringify({
          container: "max-width: 578px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #3d1f2e;",
          h1: 'font-size: 24px; font-weight: 700; color: #be185d; text-align: center; margin: 32px 0 20px 0; padding-bottom: 12px; border-bottom: 2px solid #f9a8d4; line-height: 1.4;',
          h2: 'font-size: 20px; font-weight: 700; color: #be185d; margin: 28px 0 14px 0; line-height: 1.4;',
          h2_decoration: 'border-left: 4px solid #f9a8d4; padding-left: 12px;',
          h3: 'font-size: 17px; font-weight: 600; color: #9d174d; margin: 24px 0 12px 0; line-height: 1.4;',
          h3_decoration: 'border-bottom: 1px dotted #f9a8d4; padding-bottom: 4px;',
          h4: 'font-size: 15px; font-weight: 600; color: #9d174d; margin: 20px 0 10px 0; line-height: 1.4;',
          p: 'font-size: 16px; line-height: 1.85; color: #3d1f2e; margin: 12px 0;',
          strong: 'font-weight: 700; color: #be185d;',
          em: 'font-style: italic; color: #9d174d;',
          code: 'font-family: SFMono-Regular, Consolas, monospace; font-size: 14px; background: #fce7f3; color: #be185d; padding: 2px 6px; border-radius: 4px;',
          pre: 'background: #fdf2f8; color: #3d1f2e; padding: 16px; border-radius: 12px; margin: 16px 0; line-height: 1.6; overflow-x: auto;',
          blockquote: 'border-left: 4px solid #f9a8d4; padding: 12px 16px; color: #9d174d; background: #fdf2f8; margin: 16px 0; border-radius: 0 12px 12px 0; font-style: italic;',
          list: 'font-size: 16px; line-height: 1.85; color: #3d1f2e; margin: 12px 0; padding-left: 24px;',
          image: 'max-width: 100%; height: auto; display: block; margin: 24px auto; border-radius: 12px;',
          table: 'width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 15px;',
          th: 'background: #fce7f3; font-weight: 600; color: #be185d; padding: 10px 14px; text-align: left; border: 1px solid #f9a8d4;',
          td: 'padding: 10px 14px; border: 1px solid #f9a8d4; color: #3d1f2e;',
          a: 'color: #be185d; text-decoration: none; font-weight: 500;',
          hr: 'border: none; border-top: 1px solid #f9a8d4; margin: 24px 0;',
          separator: '<section style="text-align: center; margin: 24px 0; color: #f9a8d4; font-size: 16px;">🌸 ✿ 🌸</section>',
          footer_content: '<section style="margin-top: 30px; padding: 20px; background: linear-gradient(135deg, #fdf2f8, #fce7f3); border-radius: 12px; text-align: center;"><p style="font-size: 15px; color: #be185d; margin: 0 0 6px 0;">感谢阅读 🌹</p><p style="font-size: 13px; color: #9d174d; margin: 0 0 8px 0;">喜欢就<strong>点赞</strong> · <strong>收藏</strong> · <strong>转发</strong> 吧</p><p style="font-size: 12px; color: #d1a0b5; margin: 0;">关注我，遇见更美好的自己</p></section>',
          colors: { primary: '#be185d', text: '#3d1f2e', background: '#fdf2f8', code_bg: '#fce7f3', code_color: '#be185d' },
          darkmode: { text: '#e8c4d8', background: '#1e1e1e', primary: '#f472b6', code_bg: '#2d2d2d', code_color: '#e8c4d8', quote_bg: '#2d2528' },
        }),
      },
      {
        name: '午夜深色',
        description: '深蓝黑底白色文字，适合深夜阅读和技术内容',
        is_default: 0,
        style_json: JSON.stringify({
          container: "max-width: 578px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e2e8f0; background: #0f172a;",
          h1: 'font-size: 26px; font-weight: 700; color: #f1f5f9; margin: 32px 0 16px 0; padding-bottom: 12px; border-bottom: 2px solid #60a5fa; line-height: 1.4;',
          h2: 'font-size: 22px; font-weight: 700; color: #60a5fa; border-left: 4px solid #60a5fa; padding-left: 14px; margin: 28px 0 14px 0; line-height: 1.4;',
          h3: 'font-size: 18px; font-weight: 600; color: #93c5fd; margin: 24px 0 12px 0; line-height: 1.4;',
          h4: 'font-size: 16px; font-weight: 600; color: #93c5fd; margin: 20px 0 10px 0; line-height: 1.4;',
          p: 'font-size: 16px; line-height: 1.8; color: #cbd5e1; margin: 12px 0;',
          strong: 'font-weight: 700; color: #60a5fa;',
          em: 'font-style: italic; color: #93c5fd;',
          code: 'font-family: SFMono-Regular, Consolas, monospace; font-size: 14px; background: #1e293b; color: #7dd3fc; padding: 2px 6px; border-radius: 4px;',
          pre: 'background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; margin: 16px 0; line-height: 1.6; overflow-x: auto;',
          blockquote: 'border-left: 4px solid #60a5fa; padding: 12px 16px; color: #94a3b8; background: #1e293b; margin: 16px 0; border-radius: 0 8px 8px 0;',
          list: 'font-size: 16px; line-height: 1.8; color: #cbd5e1; margin: 12px 0; padding-left: 24px;',
          image: 'max-width: 100%; height: auto; display: block; margin: 24px auto; border-radius: 8px;',
          table: 'width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 15px;',
          th: 'background: #1e293b; font-weight: 600; color: #60a5fa; padding: 10px 14px; text-align: left; border: 1px solid #334155;',
          td: 'padding: 10px 14px; border: 1px solid #334155; color: #cbd5e1;',
          a: 'color: #60a5fa; text-decoration: none; font-weight: 500;',
          hr: 'border: none; border-top: 1px solid #334155; margin: 24px 0;',
          colors: { primary: '#60a5fa', text: '#e2e8f0', background: '#0f172a', code_bg: '#1e293b', code_color: '#7dd3fc' },
          darkmode: { text: '#e2e8f0', background: '#0f172a', primary: '#60a5fa', code_bg: '#1e293b', code_color: '#7dd3fc', quote_bg: '#1e293b' },
        }),
      },
    ];

    // 插入或更新模板
    const insertTpl = db.prepare(
      `INSERT INTO layout_templates (name, description, style_json, is_default)
       SELECT ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM layout_templates WHERE name = ?)`,
    );
    const updateTpl = db.prepare('UPDATE layout_templates SET description = ?, style_json = ?, is_default = ? WHERE name = ?');

    for (const tpl of allTemplates) {
      const existing = db.prepare('SELECT id FROM layout_templates WHERE name = ?').get(tpl.name) as { id: number } | undefined;
      if (existing) {
        updateTpl.run(tpl.description, tpl.style_json, tpl.is_default, tpl.name);
      } else {
        insertTpl.run(tpl.name, tpl.description, tpl.style_json, tpl.is_default, tpl.name);
      }
    }

    // 新建 wechat_tokens 表
    const wtTableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='wechat_tokens'")
      .get();
    if (!wtTableExists) {
      console.log('[Migration] Creating wechat_tokens table');
      db.exec(`
        CREATE TABLE IF NOT EXISTS wechat_tokens (
          account_id INTEGER PRIMARY KEY,
          access_token TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // ===== 风格解析 + 素材库 =====

    // article_analysis 加 fakeid 字段
    const analysisCols = (db.pragma('table_info(article_analysis)') as Array<{ name: string }>).map(col => col.name);
    if (!analysisCols.includes('fakeid')) {
      console.log('[Migration] Adding fakeid column to article_analysis');
      db.exec('ALTER TABLE article_analysis ADD COLUMN fakeid TEXT');
    }

    // 新建 account_writing_styles 表
    const styleTableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='account_writing_styles'")
      .get();
    if (!styleTableExists) {
      console.log('[Migration] Creating account_writing_styles table');
      db.exec(`
        CREATE TABLE IF NOT EXISTS account_writing_styles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          fakeid TEXT NOT NULL,
          account_name TEXT,
          language_style TEXT,
          sentence_patterns TEXT,
          opening_techniques TEXT,
          closing_techniques TEXT,
          title_patterns TEXT,
          paragraph_rhythm TEXT,
          content_preferences TEXT,
          emotional_tone TEXT,
          signature_vocabulary TEXT,
          interaction_style TEXT,
          persona_projection TEXT,
          article_length_range TEXT,
          overall_summary TEXT,
          source_analysis_ids TEXT,
          article_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_account_styles_fakeid ON account_writing_styles(fakeid)');
    }

    // 迁移 account_writing_styles：新增结构化风格字段
    const styleCols = db.prepare("PRAGMA table_info(account_writing_styles)").all() as { name: string }[];
    const styleColNames = new Set(styleCols.map(c => c.name));
    const newStyleCols: Record<string, string> = {
      persona_positioning: 'TEXT',
      surface_language: 'TEXT',
      oral_phrase_library: 'TEXT',
      deep_writing_traits: 'TEXT',
      taboos: 'TEXT',
      sample_excerpts: 'TEXT',
      source_article_ids: 'TEXT',
    };
    for (const [col, type] of Object.entries(newStyleCols)) {
      if (!styleColNames.has(col)) {
        console.log(`[Migration] Adding column ${col} to account_writing_styles`);
        db.exec(`ALTER TABLE account_writing_styles ADD COLUMN ${col} ${type}`);
      }
    }

    // 新建 writing_materials 表
    const matTableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='writing_materials'")
      .get();
    if (!matTableExists) {
      console.log('[Migration] Creating writing_materials table');
      db.exec(`
        CREATE TABLE IF NOT EXISTS writing_materials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT NOT NULL,
          type TEXT NOT NULL,
          tags TEXT,
          source_type TEXT,
          source_id INTEGER,
          source_title TEXT,
          category TEXT,
          fakeid TEXT,
          usage_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_materials_type ON writing_materials(type)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_materials_category ON writing_materials(category)');
    }

    // ===== 工作流系统 =====

    // 新建 article_workflow 表
    const wfTableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='article_workflow'")
      .get();
    if (!wfTableExists) {
      console.log('[Migration] Creating article_workflow table');
      db.exec(`
        CREATE TABLE IF NOT EXISTS article_workflow (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          topic_id INTEGER,
          article_id INTEGER,
          title TEXT,
          category TEXT,
          topic_status TEXT DEFAULT 'pending',
          topic_error TEXT,
          topic_at DATETIME,
          material_status TEXT DEFAULT 'pending',
          material_error TEXT,
          material_at DATETIME,
          draft_status TEXT DEFAULT 'pending',
          draft_error TEXT,
          draft_at DATETIME,
          image_status TEXT DEFAULT 'pending',
          image_error TEXT,
          image_at DATETIME,
          layout_status TEXT DEFAULT 'pending',
          layout_error TEXT,
          layout_at DATETIME,
          push_status TEXT DEFAULT 'pending',
          push_error TEXT,
          push_at DATETIME,
          workflow_date TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_date ON article_workflow(workflow_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_account ON article_workflow(account_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_status ON article_workflow(status)');
    }

    // managed_accounts 扩展字段
    const maCols = (db.pragma('table_info(managed_accounts)') as Array<{ name: string }>).map(col => col.name);
    if (!maCols.includes('writing_style_id')) {
      console.log('[Migration] Adding writing_style_id to managed_accounts');
      db.exec('ALTER TABLE managed_accounts ADD COLUMN writing_style_id INTEGER');
    }
    if (!maCols.includes('layout_template_id')) {
      console.log('[Migration] Adding layout_template_id to managed_accounts');
      db.exec('ALTER TABLE managed_accounts ADD COLUMN layout_template_id INTEGER');
    }
    if (!maCols.includes('daily_publish_count')) {
      console.log('[Migration] Adding daily_publish_count to managed_accounts');
      db.exec('ALTER TABLE managed_accounts ADD COLUMN daily_publish_count INTEGER DEFAULT 1');
    }
    if (!maCols.includes('publish_time')) {
      console.log('[Migration] Adding publish_time to managed_accounts');
      db.exec("ALTER TABLE managed_accounts ADD COLUMN publish_time TEXT DEFAULT '08:00'");
    }
    if (!maCols.includes('auto_publish')) {
      console.log('[Migration] Adding auto_publish to managed_accounts');
      db.exec('ALTER TABLE managed_accounts ADD COLUMN auto_publish BOOLEAN DEFAULT 0');
    }
    // 账号级配图策略覆盖
    if (!maCols.includes('image_mode')) {
      console.log('[Migration] Adding image_mode to managed_accounts');
      db.exec("ALTER TABLE managed_accounts ADD COLUMN image_mode TEXT DEFAULT ''");
    }
    if (!maCols.includes('image_count')) {
      console.log('[Migration] Adding image_count to managed_accounts');
      db.exec('ALTER TABLE managed_accounts ADD COLUMN image_count INTEGER DEFAULT 0');
    }
    if (!maCols.includes('image_source')) {
      console.log('[Migration] Adding image_source to managed_accounts');
      db.exec("ALTER TABLE managed_accounts ADD COLUMN image_source TEXT DEFAULT ''");
    }
    if (!maCols.includes('image_config')) {
      console.log('[Migration] Adding image_config to managed_accounts');
      db.exec("ALTER TABLE managed_accounts ADD COLUMN image_config TEXT DEFAULT ''");
    }
    // 账号级固定内容（优先于模板中的固定内容）
    if (!maCols.includes('header_content')) {
      console.log('[Migration] Adding header_content to managed_accounts');
      db.exec("ALTER TABLE managed_accounts ADD COLUMN header_content TEXT DEFAULT ''");
    }
    if (!maCols.includes('footer_content')) {
      console.log('[Migration] Adding footer_content to managed_accounts');
      db.exec("ALTER TABLE managed_accounts ADD COLUMN footer_content TEXT DEFAULT ''");
    }
    if (!maCols.includes('section_prefix')) {
      console.log('[Migration] Adding section_prefix to managed_accounts');
      db.exec("ALTER TABLE managed_accounts ADD COLUMN section_prefix TEXT DEFAULT ''");
    }
    if (!maCols.includes('section_suffix')) {
      console.log('[Migration] Adding section_suffix to managed_accounts');
      db.exec("ALTER TABLE managed_accounts ADD COLUMN section_suffix TEXT DEFAULT ''");
    }

    // daily_topics 增加 status 字段：标记失败选题避免重复使用
    const dtCols = db.prepare("PRAGMA table_info(daily_topics)").all() as { name: string }[];
    if (!dtCols.some(c => c.name === 'status')) {
      console.log('[Migration] Adding status to daily_topics');
      db.exec("ALTER TABLE daily_topics ADD COLUMN status TEXT DEFAULT 'active'");
    }

    // article_workflow 增加 run_log 字段（JSON 格式存储运行日志）
    const wfCols = db.prepare("PRAGMA table_info(article_workflow)").all() as { name: string }[];
    if (!wfCols.some(c => c.name === 'run_log')) {
      console.log('[Migration] Adding run_log to article_workflow');
      db.exec('ALTER TABLE article_workflow ADD COLUMN run_log TEXT');
    }

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

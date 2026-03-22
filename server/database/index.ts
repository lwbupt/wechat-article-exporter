/**
 * SQLite 数据库连接管理
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件路径
const dataDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'wechat.db');

// 确保数据目录存在
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 创建数据库连接
const db = new Database(dbPath);

// 启用 WAL 模式 (Write-Ahead Logging) 提高并发性能
db.pragma('journal_mode = WAL');

// 启用外键约束
db.pragma('foreign_keys = ON');

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
  // 使用 process.cwd() 获取项目根目录，避免 Nuxt 编译路径问题
  const schemaPath = path.join(process.cwd(), 'server/database/schema.sql');
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

  console.log('Database initialized successfully');
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

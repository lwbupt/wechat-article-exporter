-- 微信公众号导出器 - SQLite 数据库 Schema
-- 版本: 1.0.0

-- 删除旧表（开发时使用，生产环境请注释掉）
-- DROP TABLE IF EXISTS article_resources;
-- DROP TABLE IF EXISTS comment_replies;
-- DROP TABLE IF EXISTS comments;
-- DROP TABLE IF EXISTS article_metadata;
-- DROP TABLE IF EXISTS article_html;
-- DROP TABLE IF EXISTS assets;
-- DROP TABLE IF EXISTS articles;
-- DROP TABLE IF EXISTS api_logs;
-- DROP TABLE IF EXISTS mp_accounts;

-- 公众号表
CREATE TABLE IF NOT EXISTS mp_accounts (
    fakeid TEXT PRIMARY KEY,
    nickname TEXT,
    round_head_img TEXT,
    signature TEXT,
    service_type INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT 0,
    count INTEGER DEFAULT 0,
    articles INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    create_time INTEGER,
    update_time INTEGER,
    last_update_time INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 文章表
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fakeid TEXT NOT NULL,
    aid TEXT NOT NULL,
    type INTEGER DEFAULT 0,
    title TEXT,
    digest TEXT,
    content TEXT,
    cover TEXT,
    author_name TEXT,
    copyright_stat INTEGER DEFAULT 0,
    is_original BOOLEAN DEFAULT 0,
    datetime INTEGER,
    create_time INTEGER,
    link TEXT,
    itemidx INTEGER DEFAULT 1,
    item_show_type INTEGER DEFAULT 0,
    -- 文章状态字段
    _status TEXT DEFAULT 'pending',
    _single BOOLEAN DEFAULT 0,
    is_hot BOOLEAN DEFAULT 0,
    is_deleted BOOLEAN DEFAULT 0,
    -- 下载状态字段
    content_download BOOLEAN DEFAULT 0,
    comment_download BOOLEAN DEFAULT 0,
    metadata_download BOOLEAN DEFAULT 0,
    -- HTML 内容下载时间戳
    content_download_time INTEGER,
    -- 评论下载时间戳
    comment_download_time INTEGER,
    -- 元数据下载时间戳
    metadata_download_time INTEGER,
    -- 扩展字段（用于存储额外的 JSON 数据）
    extra_fields TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fakeid) REFERENCES mp_accounts(fakeid) ON DELETE CASCADE,
    UNIQUE(fakeid, aid)
);

-- 文章内容表 (HTML)
CREATE TABLE IF NOT EXISTS article_html (
    article_id INTEGER PRIMARY KEY,
    html_content TEXT,
    file_size INTEGER DEFAULT 0,
    download_time INTEGER,
    is_valid BOOLEAN DEFAULT 1,
    validation_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

-- 元数据表 (阅读量、点赞等)
CREATE TABLE IF NOT EXISTS article_metadata (
    article_id INTEGER PRIMARY KEY,
    read_num INTEGER DEFAULT 0,
    like_num INTEGER DEFAULT 0,
    old_like_num INTEGER DEFAULT 0,
    comment_num INTEGER DEFAULT 0,
    reward_num INTEGER DEFAULT 0,
    share_num INTEGER DEFAULT 0,
    real_read_num INTEGER DEFAULT 0,
    real_like_num INTEGER DEFAULT 0,
    picked_num INTEGER DEFAULT 0,
    play_num INTEGER DEFAULT 0,
    download_time INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL,
    content_id TEXT NOT NULL,
    content TEXT,
    like_num INTEGER DEFAULT 0,
    reply_id INTEGER DEFAULT 0,
    is_friend BOOLEAN DEFAULT 0,
    is_top BOOLEAN DEFAULT 0,
    create_time INTEGER,
    reply_comment_id TEXT,
    download_time INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

-- 评论回复表
CREATE TABLE IF NOT EXISTS comment_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL,
    content_id TEXT NOT NULL,
    content TEXT,
    like_num INTEGER DEFAULT 0,
    create_time INTEGER,
    download_time INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

-- 资源表 (图片、视频等)
CREATE TABLE IF NOT EXISTS assets (
    url TEXT PRIMARY KEY,
    fakeid TEXT NOT NULL,
    file_path TEXT,
    file_size INTEGER DEFAULT 0,
    mime_type TEXT,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0,
    download_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fakeid) REFERENCES mp_accounts(fakeid) ON DELETE CASCADE
);

-- 文章资源关联表
CREATE TABLE IF NOT EXISTS article_resources (
    article_id INTEGER NOT NULL,
    asset_url TEXT NOT NULL,
    resource_type TEXT DEFAULT 'image',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_url) REFERENCES assets(url) ON DELETE CASCADE,
    PRIMARY KEY (article_id, asset_url)
);

-- API 调用记录表
CREATE TABLE IF NOT EXISTS api_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    account TEXT,
    call_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_articles_fakeid ON articles(fakeid);
CREATE INDEX IF NOT EXISTS idx_articles_create_time ON articles(create_time DESC);
CREATE INDEX IF NOT EXISTS idx_articles_datetime ON articles(datetime DESC);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(_status);
CREATE INDEX IF NOT EXISTS idx_articles_is_deleted ON articles(is_deleted);
CREATE INDEX IF NOT EXISTS idx_articles_content_download ON articles(content_download);
CREATE INDEX IF NOT EXISTS idx_articles_comment_download ON articles(comment_download);
CREATE INDEX IF NOT EXISTS idx_articles_metadata_download ON articles(metadata_download);
CREATE INDEX IF NOT EXISTS idx_articles_link ON articles(link);
CREATE INDEX IF NOT EXISTS idx_comments_article_id ON comments(article_id);
CREATE INDEX IF NOT EXISTS idx_comments_content_id ON comments(content_id);
CREATE INDEX IF NOT EXISTS idx_comments_download_time ON comments(download_time);
CREATE INDEX IF NOT EXISTS idx_assets_fakeid ON assets(fakeid);
CREATE INDEX IF NOT EXISTS idx_article_resources_article_id ON article_resources(article_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_call_time ON api_logs(call_time DESC);

-- 创建触发器：自动更新 updated_at
CREATE TRIGGER IF NOT EXISTS update_mp_accounts_timestamp
AFTER UPDATE ON mp_accounts
BEGIN
    UPDATE mp_accounts SET updated_at = CURRENT_TIMESTAMP WHERE fakeid = NEW.fakeid;
END;

CREATE TRIGGER IF NOT EXISTS update_articles_timestamp
AFTER UPDATE ON articles
BEGIN
    UPDATE articles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_assets_timestamp
AFTER UPDATE ON assets
BEGIN
    UPDATE assets SET updated_at = CURRENT_TIMESTAMP WHERE url = NEW.url;
END;

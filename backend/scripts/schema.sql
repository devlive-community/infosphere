-- 创建用户表
CREATE TABLE IF NOT EXISTS users
(
    id            INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(50) UNIQUE NOT NULL COMMENT '用户名',
    email         VARCHAR(100) UNIQUE COMMENT '邮箱',
    password      VARCHAR(255) COMMENT '密码哈希',
    role          ENUM ('admin', 'user') DEFAULT 'user' COMMENT '用户角色',
    avatar        VARCHAR(255)           DEFAULT NULL COMMENT '头像路径',
    last_login_at TIMESTAMP              DEFAULT NULL COMMENT '最后登录时间',
    created_at    TIMESTAMP              DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at    TIMESTAMP              DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    is_active     BOOLEAN                DEFAULT TRUE COMMENT '账户状态',
    bio           VARCHAR(1000)          DEFAULT NULL COMMENT '个人简介',
    github_url    VARCHAR(255)           DEFAULT NULL COMMENT 'GitHub 链接'
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci COMMENT ='用户表';

-- 创建站点配置表
CREATE TABLE IF NOT EXISTS site_configs
(
    id           INT AUTO_INCREMENT PRIMARY KEY,
    config_key   VARCHAR(50) UNIQUE NOT NULL COMMENT '配置键',
    config_value TEXT COMMENT '配置值',
    description  VARCHAR(255) COMMENT '配置描述',
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci COMMENT ='站点配置表';

CREATE TABLE IF NOT EXISTS user_authentications
(
    id                INT PRIMARY KEY AUTO_INCREMENT,
    user_id           INT                                                       NOT NULL,
    provider          ENUM ('github', 'google', 'email', 'twitter', 'facebook') NOT NULL,
    provider_id       VARCHAR(255)                                              NOT NULL,
    provider_username VARCHAR(100),
    provider_email    VARCHAR(255),
    access_token      TEXT,
    refresh_token     TEXT,
    token_expires_at  TIMESTAMP                                                 NULL,
    is_primary        BOOLEAN   DEFAULT FALSE,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE KEY unique_provider_id (provider, provider_id),
    INDEX idx_user_provider (user_id, provider),
    INDEX idx_provider_id (provider, provider_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci COMMENT '用户认证表';

-- 书籍表
CREATE TABLE IF NOT EXISTS books
(
    id          INT AUTO_INCREMENT PRIMARY KEY,
    title       VARCHAR(255) NOT NULL COMMENT '书籍标题',
    description TEXT COMMENT '书籍描述',
    cover_image VARCHAR(500) COMMENT '封面图片URL',
    slug        VARCHAR(255) NOT NULL COMMENT 'URL路径标识符',
    user_id     INT          NOT NULL COMMENT '作者ID',
    status      ENUM ('draft', 'published', 'archived')         DEFAULT 'draft' COMMENT '状态',
    is_public   BOOLEAN                                         DEFAULT FALSE COMMENT '是否公开',
    view_count  INT                                             DEFAULT 0 COMMENT '浏览次数',
    created_at  TIMESTAMP                                       DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP                                       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_slug (slug),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_is_public (is_public),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci COMMENT '书籍表';

-- 文档表（支持多级结构）
CREATE TABLE IF NOT EXISTS documents
(
    id         INT AUTO_INCREMENT PRIMARY KEY,
    book_id    INT          NOT NULL COMMENT '所属书籍ID',
    parent_id  INT          NULL COMMENT '父文档ID，NULL表示顶级文档',
    title      VARCHAR(255) NOT NULL COMMENT '文档标题',
    slug       VARCHAR(255) NOT NULL COMMENT 'URL路径标识符',
    content    LONGTEXT COMMENT '文档内容',
    user_id    INT          NOT NULL COMMENT '创建者ID',
    sort_order INT                                     DEFAULT 0 COMMENT '排序顺序',
    status     ENUM ('draft', 'published', 'archived') DEFAULT 'draft' COMMENT '状态',
    created_at TIMESTAMP                               DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP                               DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_book_id (book_id),
    INDEX idx_parent_id (parent_id),
    INDEX idx_user_id (user_id),
    INDEX idx_sort_order (sort_order),
    INDEX idx_status (status),
    UNIQUE KEY unique_book_slug (book_id, slug),
    FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES documents (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci COMMENT '文档表';
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

CREATE TABLE user_authentications
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
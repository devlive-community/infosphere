USE `infosphere`;

CREATE TABLE `infosphere_role`
(
    `id`          BIGINT(20)   NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `code`        VARCHAR(100) NOT NULL,
    `name`        VARCHAR(255)          DEFAULT NULL,
    `description` VARCHAR(255)          DEFAULT NULL,
    `create_time` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间'
) COMMENT '用户路由表';

INSERT INTO `infosphere_role`(`id`, `code`, `name`, `description`)
VALUES (1, '8b80291d-6f7f-e239-005b-faeef22088d8', 'USER', 'User Role - 拥有普通用户权限'),
       (2, '151b9c43-6385-85e2-fe33-6a720b4c570b', 'ADMIN', 'Admin Role - 拥有平台所有权限');

CREATE TABLE `infosphere_user`
(
    `id`          BIGINT(20)  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `username`    VARCHAR(25) NOT NULL,
    `password`    VARCHAR(255),
    `avatar`      VARCHAR(255)         DEFAULT '/static/images/default.png',
    `alias_name`  VARCHAR(25)          DEFAULT NULL,
    `signature`   VARCHAR(200)         DEFAULT NULL,
    `email`       VARCHAR(50),
    `active`      BOOLEAN              DEFAULT TRUE COMMENT '该账号是否激活',
    `locked`      BOOLEAN              DEFAULT FALSE COMMENT '该账号是否锁定',
    `create_time` TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间'
) COMMENT '用户表';

INSERT INTO `infosphere_user` (`id`, `username`, `password`, `avatar`, `alias_name`, `signature`, `email`, `active`, `locked`)
VALUES (1, 'Anonymous User', null, '/static/images/anonymous.png', 'Anonymous User', '我是系统匿名用户用于底层默认用户', 'anonymous@devlive.org', 0, 1);
INSERT INTO `infosphere_user` (`id`, `username`, `password`, `avatar`, `alias_name`, `signature`, `email`, `active`, `locked`)
VALUES (2, 'infosphere', '$2a$10$FsBJlTOyjqKmK9iFuRuSTub0pvO2h8amcIock.r8Pl9KMuCsScB8S', null, 'infosphere', null, 'infosphere@devlive.org', 0, 0);

CREATE TABLE `infosphere_user_role_relation`
(
    `user_id` BIGINT(20),
    `role_id` BIGINT(20)
) COMMENT '用户与路由关系表';

INSERT INTO `infosphere_user_role_relation` (`user_id`, `role_id`)
VALUES (2, 1);

CREATE TABLE `infosphere_article`
(
    `id`          BIGINT(20)   NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `code`        VARCHAR(200) NOT NULL COMMENT '文章唯一编码',
    `title`       VARCHAR(255) NOT NULL COMMENT '文章标题',
    `content`     LONGTEXT     NOT NULL COMMENT '文章内容',
    `published`   BOOLEAN      NOT NULL DEFAULT FALSE COMMENT '文章是否公开',
    `create_time` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间'
) COMMENT '文章表';

CREATE TABLE `infosphere_user_article_relation`
(
    `user_id`    BIGINT(20),
    `article_id` BIGINT(20)
) COMMENT '用户与文章关系表';

CREATE TABLE `infosphere_article_access`
(
    `id`          BIGINT AUTO_INCREMENT PRIMARY KEY,
    `ip_address`  VARCHAR(255),
    `user_agent`  VARCHAR(255),
    `create_time` DATETIME
) COMMENT '文章访问历史表';

CREATE TABLE `infosphere_article_access_article_relation`
(
    `access_id`  BIGINT,
    `article_id` BIGINT
) COMMENT '文章访问历史和文章关联表';

CREATE TABLE `infosphere_article_access_user_relation`
(
    `access_id` BIGINT,
    `user_id`   BIGINT
) COMMENT '文章访问历史和用户关联表';

USE `infosphere`;

CREATE TABLE `infosphere_tag`
(
    `id`          BIGINT(20)   NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `code`        VARCHAR(100) NOT NULL COMMENT '标签编码',
    `name`        VARCHAR(255)          DEFAULT NULL COMMENT '标签名',
    `description` VARCHAR(255)          DEFAULT NULL COMMENT '标签描述',
    `create_time` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间'
) COMMENT '标签表';

CREATE TABLE `infosphere_tag_article_relation`
(
    `article_id` BIGINT,
    `tag_id`     BIGINT
) COMMENT '标签与文章关系表';

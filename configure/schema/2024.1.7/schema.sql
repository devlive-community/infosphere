USE `infosphere`;

ALTER TABLE `infosphere_book`
    ADD COLUMN `language` varchar(255) NULL;

CREATE TABLE `infosphere_ratings`
(
    `id`          BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id`     BIGINT NOT NULL,
    `book_id`     BIGINT NOT NULL,
    `rating` DOUBLE NOT NULL, -- 评分范围可以是 0.5 到 5
    `review`      TEXT,       -- 可选的用户评价
    `create_time` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `update_time` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_user_id` FOREIGN KEY (`user_id`) REFERENCES `infosphere_user` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_book_id` FOREIGN KEY (`book_id`) REFERENCES `infosphere_book` (`id`) ON DELETE CASCADE,
    CONSTRAINT `chk_rating_range` CHECK (`rating` >= 1 AND `rating` <= 5)
);

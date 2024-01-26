package org.devlive.wikift.service.service;

import org.devlive.wikift.common.CommonResponse;
import org.devlive.wikift.service.adapter.PageAdapter;
import org.devlive.wikift.service.entity.ArticleEntity;
import org.springframework.data.domain.Pageable;

public interface ArticleService
{
    /**
     * 保存文章信息
     *
     * @param entity 文章信息
     * @return 保存的文章信息
     */
    CommonResponse<ArticleEntity> save(ArticleEntity entity);

    /**
     * 查询所有文章
     *
     * @return 文章列表
     */
    CommonResponse<PageAdapter<ArticleEntity>> findAll(String action, Pageable pageable);

    /**
     * 根据文章编码查询文章信息
     *
     * @param code 文章编码
     * @return 文章信息
     */
    CommonResponse<ArticleEntity> findArticle(String code);
}

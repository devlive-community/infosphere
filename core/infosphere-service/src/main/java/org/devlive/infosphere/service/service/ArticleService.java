package org.devlive.infosphere.service.service;

import org.devlive.infosphere.common.CommonResponse;
import org.devlive.infosphere.service.adapter.PageAdapter;
import org.devlive.infosphere.service.entity.ArticleAccessEntity;
import org.devlive.infosphere.service.entity.ArticleEntity;
import org.springframework.data.domain.Pageable;

import javax.servlet.http.HttpServletRequest;

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

    CommonResponse<ArticleEntity> findArticle(String code);

    /**
     * 根据文章编码查询文章信息
     *
     * @param code 文章编码
     * @param request 访问客户端
     * @return 文章信息
     */
    CommonResponse<ArticleEntity> findArticle(String code, HttpServletRequest request);

    /**
     * 根据文章编码获取文章访问历史
     *
     * @param code 文章编码
     * @return 文章访问历史
     */
    CommonResponse<PageAdapter<ArticleAccessEntity>> findAllAccess(String code, Pageable pageable);
}

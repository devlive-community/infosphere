package org.devlive.infosphere.service.repository;

import org.devlive.infosphere.service.entity.ArticleAccessEntity;
import org.devlive.infosphere.service.entity.ArticleEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.data.repository.query.Param;

public interface ArticleAccessRepository
        extends PagingAndSortingRepository<ArticleAccessEntity, Long>
{
    @Query(value = "SELECT e " +
            "FROM ArticleAccessEntity e " +
            "WHERE e.article = :article")
    Page<ArticleAccessEntity> findAllByArticle(@Param(value = "article") ArticleEntity article, Pageable pageable);
}

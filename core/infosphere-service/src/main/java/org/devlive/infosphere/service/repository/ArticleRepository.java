package org.devlive.infosphere.service.repository;

import org.devlive.infosphere.service.entity.ArticleEntity;
import org.devlive.infosphere.service.entity.TagEntity;
import org.devlive.infosphere.service.entity.UserEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.data.repository.query.Param;

import javax.transaction.Transactional;

import java.util.Set;

@Transactional
public interface ArticleRepository
        extends PagingAndSortingRepository<ArticleEntity, Long>
{
    @Query("SELECT e " +
            "FROM ArticleEntity e " +
            "WHERE e.published = true " +
            "ORDER BY e.createTime DESC")
    Page<ArticleEntity> findAllOrderByCreateTimeDesc(Pageable pageable);

    @Query(value = "SELECT e " +
            "FROM ArticleEntity e " +
            "WHERE e.published = true " +
            "ORDER BY e.viewCount DESC")
    Page<ArticleEntity> findAllOrderByViewCountDesc(Pageable pageable);

    @Query(value = "SELECT e " +
            "FROM ArticleEntity e " +
            "WHERE e.user = :user " +
            "ORDER BY e.createTime DESC")
    Page<ArticleEntity> findAllByUserOrderByCreateTimeDesc(@Param(value = "user") UserEntity user, Pageable pageable);

    @Query(value = "SELECT e " +
            "FROM ArticleEntity e " +
            "WHERE e.code = :code")
    ArticleEntity findByCode(@Param(value = "code") String code);

    @Query("SELECT a " +
            "FROM ArticleEntity a " +
            "JOIN a.tags t " +
            "WHERE t IN :tags " +
            "AND a.published = true ")
    Page<ArticleEntity> findAllByTags(@Param("tags") Set<TagEntity> tags, Pageable pageable);
}

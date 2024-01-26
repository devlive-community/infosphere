package org.devlive.wikift.service.repository;

import org.devlive.wikift.service.entity.ArticleEntity;
import org.devlive.wikift.service.entity.UserEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.data.repository.query.Param;

import javax.transaction.Transactional;

@Transactional
public interface ArticleRepository
        extends PagingAndSortingRepository<ArticleEntity, Long>
{
    @Query("SELECT e " +
            "FROM ArticleEntity e " +
            "ORDER BY e.createTime DESC")
    Page<ArticleEntity> findAllOrderByCreateTimeDesc(Pageable pageable);

    @Query(value = "SELECT e " +
            "FROM ArticleEntity e " +
            "WHERE e.user = :user " +
            "ORDER BY e.createTime DESC")
    Page<ArticleEntity> findAllByUserOrderByCreateTimeDesc(@Param(value = "user") UserEntity user, Pageable pageable);

    @Query(value = "SELECT e " +
            "FROM ArticleEntity e " +
            "WHERE e.code = :code")
    ArticleEntity findByCode(@Param(value = "code") String code);
}

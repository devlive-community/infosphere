package org.devlive.infosphere.service.repository;

import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.entity.UserEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface BookRepository
        extends PagingAndSortingRepository<BookEntity, Long>
{
    @Query("SELECT b " +
            "FROM BookEntity b " +
            "WHERE (:excludeUser = TRUE OR b.user = :user) " +
            "AND (:visibility IS NULL OR b.visibility = :visibility) " +
            "ORDER BY b.createTime DESC")
    Page<BookEntity> findAllByCreateTimeDesc(@Param(value = "user") UserEntity user,
            @Param(value = "visibility") Boolean visibility,
            @Param(value = "excludeUser") Boolean excludeUser,
            Pageable pageable);

    @Query("SELECT b " +
            "FROM BookEntity b " +
            "WHERE b.user = :user AND b.visibility = TRUE " +
            "ORDER BY b.createTime DESC")
    Page<BookEntity> findAllByUser(@Param(value = "user") UserEntity user, Pageable pageable);

    @Query(value = "SELECT b " +
            "FROM BookEntity b " +
            "WHERE b.visibility = TRUE " +
            "ORDER BY b.visitorCount DESC")
    Page<BookEntity> findAllByVisitorCountDesc(Pageable pageable);

    @Query(value = "SELECT b " +
            "FROM BookEntity b " +
            "WHERE b.identify = :identify")
    Optional<BookEntity> findByIdentify(@Param(value = "identify") String identify);

    @Query(value = "SELECT b " +
            "FROM BookEntity b " +
            "WHERE b.identify = :identify")
    BookEntity findByIdentifyWithNotOptional(@Param(value = "identify") String identify);

    @Query("SELECT b " +
            "FROM BookEntity b " +
            "WHERE b.visibility = TRUE " +
            "ORDER BY b.createTime DESC")
    Page<BookEntity> findTopByCreateTime(Pageable pageable);

    @Query("SELECT b " +
            "FROM BookEntity b " +
            "WHERE b.visibility = TRUE " +
            "AND (SELECT COUNT(1) FROM FollowEntity f WHERE f.user = :user AND f.identify = b.identify) > 0 " +
            "ORDER BY b.createTime DESC")
    Page<BookEntity> findAllByUserAndIsFollowed(@Param(value = "user") UserEntity user, Pageable pageable);
}

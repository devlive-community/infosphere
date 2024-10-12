package org.devlive.infosphere.service.repository;

import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.entity.RatingEntity;
import org.devlive.infosphere.service.entity.UserEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface RatingRepository
        extends PagingAndSortingRepository<RatingEntity, Long>
{
    Optional<RatingEntity> findByUserAndBook(UserEntity user, BookEntity book);

    @Query("SELECT r " +
            "FROM RatingEntity r " +
            "WHERE r.book = :book " +
            "ORDER BY r.createTime DESC")
    Page<RatingEntity> findAllByBookOrderByCreateTimeDesc(@Param(value = "book") BookEntity book, Pageable pageable);
}

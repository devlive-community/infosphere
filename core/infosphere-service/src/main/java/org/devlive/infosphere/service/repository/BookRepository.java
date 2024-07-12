package org.devlive.infosphere.service.repository;

import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.entity.UserEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.data.repository.query.Param;

import java.util.List;
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

    Optional<BookEntity> findByIdentify(String identify);

    @Query("SELECT b " +
            "FROM BookEntity b " +
            "WHERE b.visibility = TRUE " +
            "ORDER BY b.createTime DESC")
    List<BookEntity> findTopByCreateTime(Pageable pageable);
}

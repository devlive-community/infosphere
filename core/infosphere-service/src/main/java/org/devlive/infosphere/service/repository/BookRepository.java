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
            "WHERE b.user = :user " +
            "AND (:visibility IS NULL OR b.visibility = :visibility) " +
            "ORDER BY b.createTime DESC")
    Page<BookEntity> findAllByCreateTimeDesc(@Param("user") UserEntity user,
            @Param("visibility") Boolean visibility,
            Pageable pageable);

    Optional<BookEntity> findByIdentify(String identify);
}

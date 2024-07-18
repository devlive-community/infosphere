package org.devlive.infosphere.service.repository;

import org.devlive.infosphere.service.entity.AccessEntity;
import org.devlive.infosphere.service.entity.BookEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.data.repository.query.Param;

public interface AccessRepository
        extends PagingAndSortingRepository<AccessEntity, Long>
{
    @Query(value = "SELECT e " +
            "FROM AccessEntity e " +
            "WHERE e.book = :book")
    Page<AccessEntity> findAllByBook(@Param(value = "book") BookEntity book, Pageable pageable);
}

package org.devlive.infosphere.service.repository;

import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.entity.DocumentEntity;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface DocumentRepository
        extends PagingAndSortingRepository<DocumentEntity, Long>
{
    Optional<DocumentEntity> findByIdentify(String identify);

    @Query(value = "SELECT d " +
            "FROM DocumentEntity d " +
            "WHERE d.identify = :identify")
    DocumentEntity findByIdentifyWithNotOptional(@Param(value = "identify") String identify);

    List<DocumentEntity> findAllByBookOrderBySortingAsc(BookEntity book);
}

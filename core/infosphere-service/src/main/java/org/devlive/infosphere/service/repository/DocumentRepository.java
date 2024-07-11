package org.devlive.infosphere.service.repository;

import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.entity.DocumentEntity;
import org.springframework.data.repository.PagingAndSortingRepository;

import java.util.List;
import java.util.Optional;

public interface DocumentRepository
        extends PagingAndSortingRepository<DocumentEntity, Long>
{
    Optional<DocumentEntity> findByIdentify(String identify);

    List<DocumentEntity> findAllByBookOrderBySortingAsc(BookEntity book);
}

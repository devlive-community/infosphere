package org.devlive.infosphere.service.repository;

import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.entity.RatingEntity;
import org.devlive.infosphere.service.entity.UserEntity;
import org.springframework.data.repository.PagingAndSortingRepository;

import java.util.Optional;

public interface RatingRepository
        extends PagingAndSortingRepository<RatingEntity, Long>
{
    Optional<RatingEntity> findByUserAndBook(UserEntity user, BookEntity book);
}

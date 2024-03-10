package org.devlive.infosphere.service.repository;

import org.devlive.infosphere.service.entity.ArticleLikeEntity;
import org.springframework.data.repository.PagingAndSortingRepository;

public interface ArticleLikeRepository
        extends PagingAndSortingRepository<ArticleLikeEntity, Long>
{
}

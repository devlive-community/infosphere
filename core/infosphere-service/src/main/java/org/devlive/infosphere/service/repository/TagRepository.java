package org.devlive.infosphere.service.repository;

import org.devlive.infosphere.service.entity.TagEntity;
import org.springframework.data.repository.PagingAndSortingRepository;

public interface TagRepository
        extends PagingAndSortingRepository<TagEntity, Long>
{
}

package org.devlive.infosphere.service.repository;

import org.devlive.infosphere.service.entity.TagEntity;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.data.repository.query.Param;

public interface TagRepository
        extends PagingAndSortingRepository<TagEntity, Long>
{
    @Query(value = "SELECT t " +
            "FROM TagEntity t " +
            "WHERE t.code = :code")
    TagEntity findByCode(@Param(value = "code") String code);
}

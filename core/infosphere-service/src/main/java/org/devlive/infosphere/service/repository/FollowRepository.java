package org.devlive.infosphere.service.repository;

import org.devlive.infosphere.service.common.FollowType;
import org.devlive.infosphere.service.entity.FollowEntity;
import org.devlive.infosphere.service.entity.UserEntity;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface FollowRepository
        extends PagingAndSortingRepository<FollowEntity, Long>
{
    @Query("SELECT f " +
            "FROM FollowEntity f " +
            "WHERE f.user = :user " +
            "AND f.type = :type " +
            "AND f.identify = :identify")
    Optional<FollowEntity> findByUserAndIdentifyAndType(@Param(value = "user") UserEntity user,
            @Param(value = "identify") String identify,
            @Param(value = "type") FollowType type);
}

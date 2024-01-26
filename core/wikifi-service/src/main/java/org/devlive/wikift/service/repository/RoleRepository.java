package org.devlive.wikift.service.repository;

import org.devlive.wikift.service.entity.RoleEntity;
import org.springframework.data.repository.CrudRepository;

public interface RoleRepository
        extends CrudRepository<RoleEntity, Long>
{
    /**
     * 根据权限名称查询权限信息
     *
     * @param name 权限名称
     * @return 权限信息
     */
    RoleEntity findByName(String name);
}

package org.devlive.wikift.service.service;

import org.devlive.wikift.service.entity.RoleEntity;

public interface RoleService
{
    RoleEntity findByName(String name);
}

package org.devlive.infosphere.service.service;

import org.devlive.infosphere.service.entity.RoleEntity;

public interface RoleService
{
    RoleEntity findByName(String name);
}

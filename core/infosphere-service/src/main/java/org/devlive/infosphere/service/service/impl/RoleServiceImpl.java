package org.devlive.infosphere.service.service.impl;

import org.devlive.infosphere.service.entity.RoleEntity;
import org.devlive.infosphere.service.repository.RoleRepository;
import org.devlive.infosphere.service.service.RoleService;
import org.springframework.stereotype.Service;

@Service
public class RoleServiceImpl
        implements RoleService
{
    private final RoleRepository repository;

    public RoleServiceImpl(RoleRepository repository)
    {
        this.repository = repository;
    }

    @Override
    public RoleEntity findByName(String name)
    {
        return repository.findByName(name);
    }
}

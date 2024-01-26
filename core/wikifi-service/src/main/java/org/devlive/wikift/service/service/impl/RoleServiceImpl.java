package org.devlive.wikift.service.service.impl;

import org.devlive.wikift.service.entity.RoleEntity;
import org.devlive.wikift.service.repository.RoleRepository;
import org.devlive.wikift.service.service.RoleService;
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

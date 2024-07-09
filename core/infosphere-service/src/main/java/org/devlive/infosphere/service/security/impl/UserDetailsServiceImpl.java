package org.devlive.infosphere.service.security.impl;

import org.devlive.infosphere.service.entity.UserEntity;
import org.devlive.infosphere.service.repository.UserRepository;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import javax.transaction.Transactional;

@Service
public class UserDetailsServiceImpl
        implements org.springframework.security.core.userdetails.UserDetailsService
{
    private final UserRepository repository;

    public UserDetailsServiceImpl(UserRepository repository)
    {
        this.repository = repository;
    }

    @Override
    @Transactional
    public UserDetails loadUserByUsername(String username)
            throws UsernameNotFoundException
    {
        UserEntity user = repository.findByEmail(username)
                .orElseThrow(() -> new UsernameNotFoundException(String.format("未找到用户名 [ %s ] 的用户", username)));
        return UserDetailsService.build(user);
    }
}

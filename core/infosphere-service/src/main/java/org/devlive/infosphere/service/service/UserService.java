package org.devlive.infosphere.service.service;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.common.response.JwtResponse;
import org.devlive.infosphere.service.adapter.PageAdapter;
import org.devlive.infosphere.service.entity.UserEntity;
import org.springframework.data.domain.Pageable;

public interface UserService
{
    CommonResponse<JwtResponse> signing(UserEntity configure);

    CommonResponse<UserEntity> getUserById(Long id);

    CommonResponse<UserEntity> save(UserEntity configure);

    CommonResponse<UserEntity> saveAndUpdate(UserEntity configure);

    CommonResponse<UserEntity> getInfo(String code);

    CommonResponse<UserEntity> getByUsername(String username);

    CommonResponse<PageAdapter<UserEntity>> getFollow(String username, Pageable pageable);
}

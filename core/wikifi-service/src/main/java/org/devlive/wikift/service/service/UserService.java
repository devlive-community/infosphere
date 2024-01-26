package org.devlive.wikift.service.service;

import org.devlive.wikift.common.CommonResponse;
import org.devlive.wikift.common.JwtResponse;
import org.devlive.wikift.service.entity.UserEntity;

public interface UserService
{
    CommonResponse<JwtResponse> signing(UserEntity configure);

    CommonResponse<UserEntity> getUserById(Long id);

    CommonResponse<UserEntity> save(UserEntity configure);
}

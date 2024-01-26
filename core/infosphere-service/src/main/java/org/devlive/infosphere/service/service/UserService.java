package org.devlive.infosphere.service.service;

import org.devlive.infosphere.common.CommonResponse;
import org.devlive.infosphere.common.JwtResponse;
import org.devlive.infosphere.service.entity.UserEntity;

public interface UserService
{
    CommonResponse<JwtResponse> signing(UserEntity configure);

    CommonResponse<UserEntity> getUserById(Long id);

    CommonResponse<UserEntity> save(UserEntity configure);
}

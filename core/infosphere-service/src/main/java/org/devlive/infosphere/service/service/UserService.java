package org.devlive.infosphere.service.service;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.common.response.JwtResponse;
import org.devlive.infosphere.service.entity.UserEntity;

public interface UserService
{
    CommonResponse<JwtResponse> signing(UserEntity configure);

    CommonResponse<UserEntity> getUserById(Long id);

    CommonResponse<UserEntity> save(UserEntity configure);

    CommonResponse<UserEntity> saveAndUpdate(UserEntity configure);

    CommonResponse<UserEntity> getInfo(String code);
}

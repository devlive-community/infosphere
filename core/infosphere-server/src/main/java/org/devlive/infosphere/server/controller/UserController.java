package org.devlive.infosphere.server.controller;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.common.response.JwtResponse;
import org.devlive.infosphere.service.entity.UserEntity;
import org.devlive.infosphere.service.service.UserService;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/v1/user")
public class UserController
{
    private final UserService service;

    public UserController(UserService service)
    {
        this.service = service;
    }

    @PostMapping("/signin")
    public CommonResponse<JwtResponse> signing(@RequestBody UserEntity configure)
    {
        return this.service.signing(configure);
    }

    @RequestMapping(value = "register", method = RequestMethod.POST)
    CommonResponse<UserEntity> register(@RequestBody @Validated UserEntity configure)
    {
        return service.save(configure);
    }

    @GetMapping(value = "info")
    CommonResponse<UserEntity> info()
    {
        return service.getInfo(null);
    }
}

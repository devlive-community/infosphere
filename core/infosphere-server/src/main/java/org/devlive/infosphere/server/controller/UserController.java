package org.devlive.infosphere.server.controller;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.common.response.JwtResponse;
import org.devlive.infosphere.service.entity.UserEntity;
import org.devlive.infosphere.service.repository.UserRepository;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.devlive.infosphere.service.service.UserService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;

import static java.util.Objects.requireNonNull;

@RestController
@RequestMapping(value = "/api/v1/user")
public class UserController
{
    private final UserService service;
    private final PasswordEncoder encoder;
    private final UserRepository repository;

    public UserController(UserService service, PasswordEncoder encoder, UserRepository repository)
    {
        this.service = service;
        this.encoder = encoder;
        this.repository = repository;
    }

    @PostMapping
    public CommonResponse<UserEntity> save(@RequestBody UserEntity configure)
    {
        return this.service.saveAndUpdate(configure);
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

    @PutMapping(value = "/change/password")
    CommonResponse<UserEntity> changePassword(@RequestBody @Validated UserEntity configure)
    {
        Optional<UserEntity> optionalUser = repository.findById(requireNonNull(UserDetailsService.getUser()).getId());
        if (optionalUser.isPresent()) {
            if (!encoder.matches(configure.getPassword(), optionalUser.get()
                    .getPassword())) {
                return CommonResponse.failure("旧密码不正确");
            }
            configure.setPassword(encoder.encode(configure.getNewPassword()));
            return service.saveAndUpdate(configure);
        }
        else {
            return CommonResponse.failure("用户不存在");
        }
    }
}

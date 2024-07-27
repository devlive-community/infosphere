package org.devlive.infosphere.service.service.impl;

import com.google.common.collect.Lists;
import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.common.response.JwtResponse;
import org.devlive.infosphere.common.utils.NullAwareBeanUtils;
import org.devlive.infosphere.service.adapter.PageAdapter;
import org.devlive.infosphere.service.common.FollowType;
import org.devlive.infosphere.service.entity.FollowEntity;
import org.devlive.infosphere.service.entity.RoleEntity;
import org.devlive.infosphere.service.entity.UserEntity;
import org.devlive.infosphere.service.repository.FollowRepository;
import org.devlive.infosphere.service.repository.RoleRepository;
import org.devlive.infosphere.service.repository.UserRepository;
import org.devlive.infosphere.service.security.JwtService;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.devlive.infosphere.service.service.UserService;
import org.springframework.data.domain.Pageable;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.ObjectUtils;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

import static java.util.Objects.requireNonNull;

@Service
public class UserServiceImpl
        implements UserService
{
    private final UserRepository repository;
    private final RoleRepository roleRepository;
    private final FollowRepository followRepository;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final PasswordEncoder encoder;

    public UserServiceImpl(UserRepository repository, RoleRepository roleRepository, FollowRepository followRepository, AuthenticationManager authenticationManager, JwtService jwtService, PasswordEncoder encoder)
    {
        this.repository = repository;
        this.roleRepository = roleRepository;
        this.followRepository = followRepository;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.encoder = encoder;
    }

    @Override
    public CommonResponse<JwtResponse> signing(UserEntity configure)
    {
        UsernamePasswordAuthenticationToken authenticationToken = new UsernamePasswordAuthenticationToken(configure.getEmail(), configure.getPassword());
        Authentication authentication = authenticationManager.authenticate(authenticationToken);

        SecurityContextHolder.getContext().setAuthentication(authentication);
        String jwt = jwtService.generateJwtToken(authentication);

        UserDetailsService userDetails = (UserDetailsService) authentication.getPrincipal();
        List<String> roles = userDetails.getAuthorities()
                .stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toList());
        return CommonResponse.success(new JwtResponse(jwt, userDetails.getId(), userDetails.getUsername(), roles, userDetails.getAvatar()));
    }

    @Override
    public CommonResponse<UserEntity> getUserById(final Long id)
    {
        return repository.findById(id)
                .map(CommonResponse::success)
                .orElseGet(() -> CommonResponse.failure(String.format("User [ %s ] not found", id)));
    }

    @Override
    public CommonResponse<UserEntity> save(UserEntity configure)
    {
        if (!configure.getPassword().equals(configure.getConfirmPassword())) {
            return CommonResponse.failure("两次输入的密码不一致");
        }

        Optional<UserEntity> existingEmailUser = repository.findByEmail(configure.getEmail());
        if (existingEmailUser.isPresent()) {
            return CommonResponse.failure(String.format("用户邮箱 [ %s ] 已存在", configure.getEmail()));
        }

        Optional<UserEntity> existingUsernameUser = repository.findByUsername(configure.getUsername());
        if (existingUsernameUser.isPresent()) {
            return CommonResponse.failure(String.format("用户名称 [ %s ] 已存在", configure.getUsername()));
        }

        // 设置用户基本信息
        configure.setPassword(encoder.encode(configure.getPassword()));
        configure.setAliasName(configure.getUsername());

        // 默认设置用户权限为USER
        List<RoleEntity> roles = Lists.newArrayList();
        roles.add(roleRepository.findByName("USER"));
        configure.setRoles(roles);
        return CommonResponse.success(repository.save(configure));
    }

    @Override
    public CommonResponse<UserEntity> saveAndUpdate(UserEntity configure)
    {
        Long id = ObjectUtils.isEmpty(configure.getId()) ? requireNonNull(UserDetailsService.getUser()).getId() : configure.getId();
        repository.findById(id)
                .ifPresent(value -> NullAwareBeanUtils.copyNullProperties(value, configure));
        return CommonResponse.success(repository.save(configure));
    }

    @Override
    public CommonResponse<UserEntity> getInfo(String code)
    {
        return getUserById(requireNonNull(UserDetailsService.getUser())
                .getId());
    }

    @Override
    public CommonResponse<UserEntity> getByUsername(String username)
    {
        return repository.findByUsername(username)
                .map(value -> {
                    Optional<FollowEntity> existingFollow = followRepository.findByUserAndIdentifyAndType(UserDetailsService.getUser(), value.getUsername(), FollowType.USER);
                    value.setIsFollowed(existingFollow.isPresent());
                    return CommonResponse.success(value);
                })
                .orElseGet(() -> CommonResponse.failure(String.format("用户 [ %s ] 不存在", username)));
    }

    @Override
    public CommonResponse<PageAdapter<UserEntity>> getFollow(String username, Pageable pageable)
    {
        return repository.findByUsername(username)
                .map(value -> CommonResponse.success(PageAdapter.of(repository.findAllByUserAndIsFollowed(value, pageable))))
                .orElseGet(() -> CommonResponse.failure(String.format("用户 [ %s ] 不存在", username)));
    }
}

package org.devlive.infosphere.service.service.impl;

import com.google.common.collect.Lists;
import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.common.response.JwtResponse;
import org.devlive.infosphere.service.entity.RoleEntity;
import org.devlive.infosphere.service.entity.UserEntity;
import org.devlive.infosphere.service.repository.RoleRepository;
import org.devlive.infosphere.service.repository.UserRepository;
import org.devlive.infosphere.service.security.JwtService;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.devlive.infosphere.service.service.UserService;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class UserServiceImpl
        implements UserService
{
    private final UserRepository repository;
    private final RoleRepository roleRepository;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final PasswordEncoder encoder;
    private final AuthenticationProvider authenticationProvider;

    public UserServiceImpl(UserRepository repository, RoleRepository roleRepository, AuthenticationManager authenticationManager, JwtService jwtService, PasswordEncoder encoder, AuthenticationProvider authenticationProvider)
    {
        this.repository = repository;
        this.roleRepository = roleRepository;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.encoder = encoder;
        this.authenticationProvider = authenticationProvider;
    }

//    @Autowired
//    private ArticleRepository articleRepository;

    @Override
    public CommonResponse<JwtResponse> signing(UserEntity configure)
    {
        UsernamePasswordAuthenticationToken authenticationToken = new UsernamePasswordAuthenticationToken(configure.getUsername(), configure.getPassword());
        Authentication authentication = authenticationManager.authenticate(authenticationToken);

        SecurityContextHolder.getContext().setAuthentication(authentication);
        String jwt = jwtService.generateJwtToken(authentication);

        UserDetailsService userDetails = (UserDetailsService) authentication.getPrincipal();
        List<String> roles = userDetails.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toList());

        JwtResponse jwtResponse = new JwtResponse(jwt, userDetails.getId(), userDetails.getUsername(), roles, userDetails.getAvatar());
        authenticationProvider.authenticate(authentication);
        return CommonResponse.success(jwtResponse);
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
        if (!configure.getPassword().equals(configure.getConformPassword())) {
            return CommonResponse.failure("两次输入的密码不一致");
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
}

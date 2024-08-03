package org.devlive.infosphere.service.aspect;

import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.devlive.infosphere.service.annotation.CheckPermission;
import org.devlive.infosphere.service.common.PermissionType;
import org.devlive.infosphere.service.entity.UserEntity;
import org.devlive.infosphere.service.repository.UserRepository;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.stereotype.Component;

@Aspect
@Component
public class CheckPermissionAspect
{
    private final UserRepository userRepository;

    public CheckPermissionAspect(UserRepository userRepository)
    {
        this.userRepository = userRepository;
    }

    @Before("@annotation(checkPermission)")
    public void checkPermission(JoinPoint joinPoint, CheckPermission checkPermission)
    {
        UserEntity entity = UserDetailsService.getUser();
        if (entity == null) {
            throw new SecurityException("用户未登录");
        }
        // 检查是否拥有修改用户权限
        if (checkPermission.value().equals(PermissionType.USER)) {
            Object object = joinPoint.getArgs()[0];
            if (object instanceof UserEntity) {
                UserEntity configure = (UserEntity) object;
                userRepository.findByUsername(configure.getUsername())
                        .ifPresent(value -> {
                            if (!entity.getId().equals(value.getId())) {
                                throw new InsufficientAuthenticationException("无效的用户权限");
                            }
                        });
            }
        }
    }
}

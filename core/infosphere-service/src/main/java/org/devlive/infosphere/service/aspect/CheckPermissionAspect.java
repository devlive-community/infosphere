package org.devlive.infosphere.service.aspect;

import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.devlive.infosphere.service.annotation.CheckPermission;
import org.devlive.infosphere.service.common.PermissionType;
import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.entity.DocumentEntity;
import org.devlive.infosphere.service.entity.UserEntity;
import org.devlive.infosphere.service.repository.BookRepository;
import org.devlive.infosphere.service.repository.DocumentRepository;
import org.devlive.infosphere.service.repository.UserRepository;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.stereotype.Component;

@Aspect
@Component
public class CheckPermissionAspect
{
    private final UserRepository userRepository;
    private final BookRepository bookRepository;
    private final DocumentRepository documentRepository;

    public CheckPermissionAspect(UserRepository userRepository, BookRepository bookRepository, DocumentRepository documentRepository)
    {
        this.userRepository = userRepository;
        this.bookRepository = bookRepository;
        this.documentRepository = documentRepository;
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

        // 检查是否拥有修改书籍权限
        if (checkPermission.value().equals(PermissionType.BOOK)) {
            Object object = joinPoint.getArgs()[0];
            if (object instanceof BookEntity) {
                BookEntity configure = (BookEntity) object;
                bookRepository.findByIdentify(configure.getIdentify())
                        .ifPresent(value -> {
                            if (!entity.getId().equals(value.getUser().getId())) {
                                throw new InsufficientAuthenticationException("无效的用户权限");
                            }
                        });
            }
        }

        // 检查是否拥有修改文档权限
        if (checkPermission.value().equals(PermissionType.DOCUMENT)) {
            Object object = joinPoint.getArgs()[0];
            if (object instanceof DocumentEntity) {
                DocumentEntity configure = (DocumentEntity) object;
                documentRepository.findByIdentify(configure.getIdentify())
                        .ifPresent(value -> {
                            if (!entity.getId().equals(value.getUser().getId())) {
                                throw new InsufficientAuthenticationException("无效的用户权限");
                            }
                        });
            }
        }
    }
}

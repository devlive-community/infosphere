package org.devlive.infosphere.service.service.impl;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.common.FollowType;
import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.entity.FollowEntity;
import org.devlive.infosphere.service.repository.BookRepository;
import org.devlive.infosphere.service.repository.FollowRepository;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.devlive.infosphere.service.service.FollowService;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class FollowServiceImpl
        implements FollowService
{
    private final FollowRepository repository;
    private final BookRepository bookRepository;

    public FollowServiceImpl(FollowRepository repository, BookRepository bookRepository)
    {
        this.repository = repository;
        this.bookRepository = bookRepository;
    }

    @Override
    public CommonResponse<FollowEntity> save(FollowEntity configure)
    {
        if (configure.getType().equals(FollowType.BOOK)) {
            Optional<BookEntity> bookOptional = bookRepository.findByIdentify(configure.getIdentify());
            if (bookOptional.isPresent()) {
                configure.setUser(UserDetailsService.getUser());
//                if (bookOptional.get()
//                        .getUser()
//                        .getId().equals(configure.getUser().getId())) {
//                    return CommonResponse.failure("不能关注自己的书籍");
//                }

                Optional<FollowEntity> existingFollow = repository.findByUserAndIdentifyAndType(configure.getUser(), configure.getIdentify(), configure.getType());
                if (existingFollow.isPresent()) {
                    return CommonResponse.failure(String.format("书籍 [ %s ] 已关注", configure.getIdentify()));
                }
                FollowEntity savedConfigure = repository.save(configure);
                return CommonResponse.success(savedConfigure);
            }
            else {
                return CommonResponse.failure(String.format("书籍 [ %s ] 不存在", configure.getIdentify()));
            }
        }
        else {
            return CommonResponse.failure(String.format("不支持的关注类型 [ %s ]", configure.getType()));
        }
    }

    @Override
    public CommonResponse<Integer> delete(FollowEntity configure)
    {
        return repository.findByUserAndIdentifyAndType(UserDetailsService.getUser(), configure.getIdentify(), configure.getType())
                .map(value -> {
                    repository.delete(value);
                    return CommonResponse.success(1);
                })
                .orElseGet(() -> CommonResponse.failure("没有找到关注信息"));
    }
}

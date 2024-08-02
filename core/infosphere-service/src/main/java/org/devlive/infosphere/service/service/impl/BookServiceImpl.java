package org.devlive.infosphere.service.service.impl;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.common.utils.NullAwareBeanUtils;
import org.devlive.infosphere.service.adapter.PageAdapter;
import org.devlive.infosphere.service.common.FollowType;
import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.entity.FollowEntity;
import org.devlive.infosphere.service.entity.UserEntity;
import org.devlive.infosphere.service.repository.BookRepository;
import org.devlive.infosphere.service.repository.FollowRepository;
import org.devlive.infosphere.service.repository.UserRepository;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.devlive.infosphere.service.service.BookService;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.ObjectUtils;

import java.util.Optional;

@Service
public class BookServiceImpl
        implements BookService
{
    private final BookRepository repository;
    private final UserRepository userRepository;
    private final FollowRepository followRepository;

    public BookServiceImpl(BookRepository repository, UserRepository userRepository, FollowRepository followRepository)
    {
        this.repository = repository;
        this.userRepository = userRepository;
        this.followRepository = followRepository;
    }

    @Override
    public CommonResponse<PageAdapter<BookEntity>> getAll(Boolean visibility, Boolean excludeUser, Pageable pageable)
    {
        return CommonResponse.success(PageAdapter.of(repository.findAllByCreateTimeDesc(UserDetailsService.getUser(), visibility, excludeUser, pageable)));
    }

    @Override
    public CommonResponse<PageAdapter<BookEntity>> getAllByUser(String username, Pageable pageable)
    {
        return userRepository.findByUsername(username)
                .map(value -> CommonResponse.success(PageAdapter.of(repository.findAllByUser(value, pageable))))
                .orElseGet(() -> CommonResponse.failure(String.format("用户 [ %s ] 不存在", username)));
    }

    @Transactional
    @Override
    public CommonResponse<BookEntity> getByIdentify(String identify)
    {
        return repository.findByIdentify(identify)
                .map(value -> {
                    Optional<FollowEntity> existingFollow = followRepository.findByUserAndIdentifyAndType(UserDetailsService.getUser(), value.getIdentify(), FollowType.BOOK);
                    value.setIsFollowed(existingFollow.isPresent());
                    return CommonResponse.success(value);
                })
                .orElseGet(() -> CommonResponse.failure(String.format("书籍 [ %s ] 不存在", identify)));
    }

    @Override
    public CommonResponse<BookEntity> saveAndUpdate(BookEntity configure)
    {
        Optional<BookEntity> existingBook = repository.findByIdentify(configure.getIdentify());
        if (ObjectUtils.isEmpty(configure.getId())) {
            if (existingBook.isPresent()) {
                return CommonResponse.failure(String.format("书籍标记 [ %s ] 已存在", configure.getIdentify()));
            }
            configure.setUser(UserDetailsService.getUser());
        }

        if (!ObjectUtils.isEmpty(configure.getId()) && existingBook.isPresent()) {
            NullAwareBeanUtils.copyNullProperties(existingBook.get(), configure);
        }

        return CommonResponse.success(repository.save(configure));
    }

    @Override
    public CommonResponse<PageAdapter<BookEntity>> getNewest(Pageable pageable)
    {
        return CommonResponse.success(PageAdapter.of(repository.findTopByCreateTime(pageable)));
    }

    @Override
    public CommonResponse<PageAdapter<BookEntity>> getHottest(Pageable pageable)
    {
        return CommonResponse.success(PageAdapter.of(repository.findAllByVisitorCountDesc(pageable)));
    }

    @Override
    public CommonResponse<PageAdapter<BookEntity>> getFollow(String username, Pageable pageable)
    {
        return userRepository.findByUsername(username)
                .map(value -> CommonResponse.success(PageAdapter.of(repository.findAllByUserAndIsFollowed(value, pageable))))
                .orElseGet(() -> CommonResponse.failure(String.format("用户 [ %s ] 不存在", username)));
    }

    @Override
    public CommonResponse<PageAdapter<UserEntity>> getFans(String identify, Pageable pageable)
    {
        return repository.findByIdentify(identify)
                .map(value -> CommonResponse.success(PageAdapter.of(repository.findFansByBook(value.getIdentify(), pageable))))
                .orElseGet(() -> CommonResponse.failure(String.format("书籍 [ %s ] 不存在", identify)));
    }
}

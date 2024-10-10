package org.devlive.infosphere.service.service.impl;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.entity.RatingEntity;
import org.devlive.infosphere.service.entity.UserEntity;
import org.devlive.infosphere.service.repository.BookRepository;
import org.devlive.infosphere.service.repository.RatingRepository;
import org.devlive.infosphere.service.repository.UserRepository;
import org.devlive.infosphere.service.service.RatingService;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class RatingServiceImpl
        implements RatingService
{
    private final RatingRepository repository;
    private final BookRepository bookRepository;
    private final UserRepository userRepository;

    public RatingServiceImpl(RatingRepository repository, BookRepository bookRepository, UserRepository userRepository)
    {
        this.repository = repository;
        this.bookRepository = bookRepository;
        this.userRepository = userRepository;
    }

    @Override
    public CommonResponse<RatingEntity> saveAndUpdate(RatingEntity configure)
    {
        Optional<BookEntity> existingBook = bookRepository.findById(configure.getBook().getId());
        if (existingBook.isEmpty()) {
            return CommonResponse.failure(String.format("书籍 [ %s ] 不存在", configure.getId()));
        }

        Optional<UserEntity> existingUser = userRepository.findById(configure.getUser().getId());
        if (existingUser.isEmpty()) {
            return CommonResponse.failure(String.format("用户 [ %s ] 不存在", configure.getId()));
        }

        if (configure.getUser().getId().equals(existingBook.get().getId())) {
            return CommonResponse.failure("不能给自己的书籍评分");
        }

        return CommonResponse.success(repository.save(configure));
    }
}

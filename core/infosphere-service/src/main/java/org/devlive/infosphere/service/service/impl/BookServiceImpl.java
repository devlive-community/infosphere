package org.devlive.infosphere.service.service.impl;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.common.utils.NullAwareBeanUtils;
import org.devlive.infosphere.service.adapter.PageAdapter;
import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.repository.BookRepository;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.devlive.infosphere.service.service.BookService;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.util.ObjectUtils;

import java.util.Optional;

@Service
public class BookServiceImpl
        implements BookService
{
    private final BookRepository repository;

    public BookServiceImpl(BookRepository repository)
    {
        this.repository = repository;
    }

    @Override
    public CommonResponse<PageAdapter<BookEntity>> getAll(Boolean visibility, Pageable pageable)
    {
        return CommonResponse.success(PageAdapter.of(repository.findAllByCreateTimeDesc(UserDetailsService.getUser(), visibility, pageable)));
    }

    @Override
    public CommonResponse<BookEntity> getByIdentify(String identify)
    {
        return repository.findByIdentify(identify)
                .map(CommonResponse::success)
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
}

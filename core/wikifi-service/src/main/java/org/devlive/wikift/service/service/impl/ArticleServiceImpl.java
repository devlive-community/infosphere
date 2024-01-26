package org.devlive.wikift.service.service.impl;

import org.devlive.wikift.common.CommonResponse;
import org.devlive.wikift.common.utils.NullAwareBeanUtils;
import org.devlive.wikift.service.adapter.PageAdapter;
import org.devlive.wikift.service.entity.ArticleEntity;
import org.devlive.wikift.service.repository.ArticleRepository;
import org.devlive.wikift.service.security.UserDetailsService;
import org.devlive.wikift.service.service.ArticleService;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import javax.transaction.Transactional;

import java.util.UUID;

@Service
public class ArticleServiceImpl
        implements ArticleService
{
    private final ArticleRepository repository;

    public ArticleServiceImpl(ArticleRepository repository)
    {
        this.repository = repository;
    }

    @Override
    public CommonResponse<ArticleEntity> save(ArticleEntity entity)
    {
        if (entity.getId() == null) {
            entity.setCode(UUID.randomUUID().toString());
            entity.setUser(UserDetailsService.getUser());
        }
        else {
            repository.findById(entity.getId())
                    .ifPresent(value -> NullAwareBeanUtils.copyNullProperties(value, entity));
        }
        return CommonResponse.success(repository.save(entity));
    }

    @Override
    public CommonResponse<PageAdapter<ArticleEntity>> findAll(String action, Pageable pageable)
    {
        if (action.equals("forme")) {
            return CommonResponse.success(PageAdapter.of(repository.findAllByUserOrderByCreateTimeDesc(UserDetailsService.getUser(), pageable)));
        }
        else {
            return CommonResponse.success(PageAdapter.of(repository.findAllOrderByCreateTimeDesc(pageable)));
        }
    }

    @Override
    @Transactional
    public CommonResponse<ArticleEntity> findArticle(String code)
    {
        return CommonResponse.success(repository.findByCode(code));
    }
}

package org.devlive.infosphere.service.service.impl;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.adapter.PageAdapter;
import org.devlive.infosphere.service.entity.TagEntity;
import org.devlive.infosphere.service.repository.TagRepository;
import org.devlive.infosphere.service.service.TagService;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

@Service
public class TagServiceImpl
        implements TagService
{
    private final TagRepository repository;

    public TagServiceImpl(TagRepository repository)
    {
        this.repository = repository;
    }

    @Override
    public CommonResponse<PageAdapter<TagEntity>> findAll(Pageable pageable)
    {
        return CommonResponse.success(PageAdapter.of(repository.findAll(pageable)));
    }
}

package org.devlive.infosphere.service.service;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.adapter.PageAdapter;
import org.devlive.infosphere.service.entity.TagEntity;
import org.springframework.data.domain.Pageable;

public interface TagService
{
    CommonResponse<PageAdapter<TagEntity>> findAll(Pageable pageable);
}

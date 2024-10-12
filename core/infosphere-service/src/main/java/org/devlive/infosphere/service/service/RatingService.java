package org.devlive.infosphere.service.service;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.adapter.PageAdapter;
import org.devlive.infosphere.service.entity.RatingEntity;
import org.springframework.data.domain.Pageable;

public interface RatingService
{
    CommonResponse<RatingEntity> saveAndUpdate(RatingEntity configure);

    CommonResponse<PageAdapter<RatingEntity>> getAll(String bookIdentify, Pageable pageable);
}

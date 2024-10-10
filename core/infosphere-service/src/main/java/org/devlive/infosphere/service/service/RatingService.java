package org.devlive.infosphere.service.service;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.entity.RatingEntity;

public interface RatingService
{
    CommonResponse<RatingEntity> saveAndUpdate(RatingEntity configure);
}

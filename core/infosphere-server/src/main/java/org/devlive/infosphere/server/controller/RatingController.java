package org.devlive.infosphere.server.controller;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.entity.RatingEntity;
import org.devlive.infosphere.service.service.RatingService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/v1/rating")
public class RatingController
{
    private final RatingService service;

    public RatingController(RatingService service)
    {
        this.service = service;
    }

    @PostMapping
    public CommonResponse<RatingEntity> save(@RequestBody RatingEntity configure)
    {
        return service.saveAndUpdate(configure);
    }
}

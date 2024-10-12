package org.devlive.infosphere.server.controller;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.adapter.PageAdapter;
import org.devlive.infosphere.service.adapter.PageFilterAdapter;
import org.devlive.infosphere.service.adapter.PageRequestAdapter;
import org.devlive.infosphere.service.annotation.SkipAuthenticated;
import org.devlive.infosphere.service.entity.RatingEntity;
import org.devlive.infosphere.service.service.RatingService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
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

    @GetMapping(value = "{identify}")
    @SkipAuthenticated
    public CommonResponse<PageAdapter<RatingEntity>> getAll(@PathVariable(value = "identify") String identify,
            @ModelAttribute PageFilterAdapter configure)
    {
        return service.getAll(identify, PageRequestAdapter.of(configure.getPage(), configure.getSize()));
    }
}

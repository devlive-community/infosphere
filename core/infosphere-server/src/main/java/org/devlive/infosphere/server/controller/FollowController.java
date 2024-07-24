package org.devlive.infosphere.server.controller;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.entity.FollowEntity;
import org.devlive.infosphere.service.service.FollowService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/v1/follow")
public class FollowController
{
    private final FollowService service;

    public FollowController(FollowService service)
    {
        this.service = service;
    }

    @PostMapping
    public CommonResponse<FollowEntity> save(@RequestBody FollowEntity configure)
    {
        return service.save(configure);
    }

    @PutMapping
    public CommonResponse<Integer> delete(@RequestBody FollowEntity configure)
    {
        return service.delete(configure);
    }
}

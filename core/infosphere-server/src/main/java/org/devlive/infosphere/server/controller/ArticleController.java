package org.devlive.infosphere.server.controller;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.entity.ArticleEntity;
import org.devlive.infosphere.service.service.ArticleService;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/v1/article")
public class ArticleController
{
    private final ArticleService service;

    public ArticleController(ArticleService service)
    {
        this.service = service;
    }

    @RequestMapping(method = {RequestMethod.POST, RequestMethod.PUT})
    CommonResponse<ArticleEntity> save(@RequestBody ArticleEntity entity)
    {
        return service.save(entity);
    }
}

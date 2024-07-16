package org.devlive.infosphere.server.controller;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.entity.DocumentEntity;
import org.devlive.infosphere.service.service.DocumentService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/v1/document")
public class DocumentController
{
    private final DocumentService service;

    public DocumentController(DocumentService service)
    {
        this.service = service;
    }

    @RequestMapping(method = {RequestMethod.POST, RequestMethod.PUT})
    public CommonResponse<DocumentEntity> save(@RequestBody DocumentEntity configure)
    {
        return service.saveAndUpdate(configure);
    }

    @GetMapping(value = "info/{identify}")
    public CommonResponse<DocumentEntity> info(@PathVariable(value = "identify") String identify)
    {
        return service.getByIdentify(identify);
    }
}

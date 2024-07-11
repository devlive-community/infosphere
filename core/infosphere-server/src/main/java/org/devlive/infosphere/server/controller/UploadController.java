package org.devlive.infosphere.server.controller;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.body.UploadBody;
import org.devlive.infosphere.service.service.UploadService;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/v1/upload")
public class UploadController
{
    private final UploadService service;

    public UploadController(UploadService service)
    {
        this.service = service;
    }

    @PostMapping
    public CommonResponse<Object> upload(@ModelAttribute UploadBody configure)
    {
        return service.upload(configure);
    }
}

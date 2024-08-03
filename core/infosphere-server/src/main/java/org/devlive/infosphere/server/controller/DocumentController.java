package org.devlive.infosphere.server.controller;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.annotation.CheckPermission;
import org.devlive.infosphere.service.common.PermissionType;
import org.devlive.infosphere.service.entity.DocumentEntity;
import org.devlive.infosphere.service.service.DocumentService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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

    @PostMapping
    public CommonResponse<DocumentEntity> save(@RequestBody DocumentEntity configure)
    {
        return service.saveAndUpdate(configure);
    }

    @PutMapping
    @CheckPermission(value = PermissionType.DOCUMENT)
    public CommonResponse<DocumentEntity> update(@RequestBody DocumentEntity configure)
    {
        return service.saveAndUpdate(configure);
    }

    @GetMapping(value = "info/{identify}")
    public CommonResponse<DocumentEntity> info(@PathVariable(value = "identify") String identify,
            @RequestParam(value = "withChildren", required = false, defaultValue = "false") Boolean withChildren)
    {
        if (withChildren) {
            return service.getByIdentifyWithChildren(identify);
        }
        else {
            return service.getByIdentify(identify);
        }
    }

    @DeleteMapping(value = "{identify}")
    @CheckPermission(value = PermissionType.DOCUMENT)
    public CommonResponse<Integer> delete(@PathVariable(value = "identify") String identify)
    {
        return service.deleteByIdentify(identify);
    }
}

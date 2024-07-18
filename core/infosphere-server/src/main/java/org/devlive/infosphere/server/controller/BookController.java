package org.devlive.infosphere.server.controller;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.adapter.PageAdapter;
import org.devlive.infosphere.service.adapter.PageFilterAdapter;
import org.devlive.infosphere.service.adapter.PageRequestAdapter;
import org.devlive.infosphere.service.entity.AccessEntity;
import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.entity.DocumentEntity;
import org.devlive.infosphere.service.service.AccessService;
import org.devlive.infosphere.service.service.BookService;
import org.devlive.infosphere.service.service.DocumentService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;

import java.util.List;

@RestController
@RequestMapping(value = "/api/v1/book")
public class BookController
{
    private final BookService service;
    private final DocumentService documentService;
    private final AccessService accessService;

    public BookController(BookService service, DocumentService documentService, AccessService accessService)
    {
        this.service = service;
        this.documentService = documentService;
        this.accessService = accessService;
    }

    @GetMapping
    public CommonResponse<PageAdapter<BookEntity>> getAll(@ModelAttribute PageFilterAdapter configure)
    {
        return service.getAll(configure.getVisibility(), configure.getExcludeUser(), PageRequestAdapter.of(configure.getPage(), configure.getSize()));
    }

    @RequestMapping(method = {RequestMethod.POST, RequestMethod.PUT})
    public CommonResponse<BookEntity> save(@RequestBody BookEntity configure)
    {
        return service.saveAndUpdate(configure);
    }

    @GetMapping(value = "info/{identify}")
    public CommonResponse<BookEntity> info(@PathVariable(value = "identify") String identify)
    {
        return service.getByIdentify(identify);
    }

    @PostMapping(value = "access/{identify}")
    public CommonResponse<AccessEntity> access(@PathVariable(value = "identify") String identify, HttpServletRequest request)
    {
        return accessService.save(identify, request);
    }

    @GetMapping(value = "access/{identify}")
    public CommonResponse<PageAdapter<AccessEntity>> access(@PathVariable(value = "identify") String identify,
            @ModelAttribute PageFilterAdapter configure)
    {
        return accessService.getAccessByBook(identify, PageRequestAdapter.of(configure.getPage(), configure.getSize()));
    }

    @GetMapping(value = "catalog/{identify}")
    public CommonResponse<List<DocumentEntity>> catalog(@PathVariable(value = "identify") String identify)
    {
        return documentService.getCatalogByBook(identify);
    }

    @GetMapping(value = "latest/{top}")
    public CommonResponse<List<BookEntity>> latest(@PathVariable(value = "top") Integer top)
    {
        return service.getTopByCreateTime(top);
    }

    @GetMapping(value = "public")
    public CommonResponse<PageAdapter<BookEntity>> getAllPublic(@ModelAttribute PageFilterAdapter configure)
    {
        return service.getAll(true, configure.getExcludeUser(), PageRequestAdapter.of(configure.getPage(), configure.getSize()));
    }
}

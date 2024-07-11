package org.devlive.infosphere.server.controller;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.adapter.PageAdapter;
import org.devlive.infosphere.service.adapter.PageFilterAdapter;
import org.devlive.infosphere.service.adapter.PageRequestAdapter;
import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.service.BookService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping(value = "/api/v1/book")
public class BookController
{
    private final BookService service;

    public BookController(BookService service)
    {
        this.service = service;
    }

    @GetMapping
    public CommonResponse<PageAdapter<BookEntity>> getAll(@ModelAttribute PageFilterAdapter configure)
    {
        return service.getAll(configure.getVisibility(), PageRequestAdapter.of(configure.getPage(), configure.getSize()));
    }

    @RequestMapping(method = {RequestMethod.POST, RequestMethod.PUT})
    public CommonResponse<BookEntity> save(@RequestBody BookEntity configure)
    {
        return service.saveAndUpdate(configure);
    }

    @GetMapping(value = "{identify}")
    public CommonResponse<BookEntity> info(@PathVariable(value = "identify") String identify)
    {
        return service.getByIdentify(identify);
    }

    @GetMapping(value = "latest/{top}")
    public CommonResponse<List<BookEntity>> latest(@PathVariable(value = "top") Integer top)
    {
        return service.getTopByCreateTime(top);
    }
}

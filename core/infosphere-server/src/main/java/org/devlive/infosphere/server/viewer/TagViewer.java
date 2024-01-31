package org.devlive.infosphere.server.viewer;

import org.devlive.infosphere.service.adapter.PageRequestAdapter;
import org.devlive.infosphere.service.repository.TagRepository;
import org.devlive.infosphere.service.service.ArticleService;
import org.devlive.infosphere.service.service.TagService;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@Component(value = "TagViewer")
@RequestMapping(value = "viewer/tag")
public class TagViewer
{
    private final TagRepository repository;
    private final TagService service;
    private final ArticleService articleService;

    public TagViewer(TagRepository repository, TagService service, ArticleService articleService)
    {
        this.repository = repository;
        this.service = service;
        this.articleService = articleService;
    }

    @GetMapping(value = {"", "/{page}/{size}"})
    public String home(Model model,
            @PathVariable(value = "page", required = false) Integer page,
            @PathVariable(value = "size", required = false) Integer size)
    {
        model.addAttribute("response", service.findAll(PageRequestAdapter.of(page, size)));
        return "tag/home";
    }

    @GetMapping(value = "/{code}")
    public String articles(Model model,
            @PathVariable(value = "code") String code,
            @PathVariable(value = "page", required = false) Integer page,
            @PathVariable(value = "size", required = false) Integer size)
    {
        model.addAttribute("tag", repository.findByCode(code));
        model.addAttribute("response", articleService.findAllByTag(code, PageRequestAdapter.of(page, size)));
        return "tag/info";
    }
}

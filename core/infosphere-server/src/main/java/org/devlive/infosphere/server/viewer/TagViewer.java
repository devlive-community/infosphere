package org.devlive.infosphere.server.viewer;

import org.devlive.infosphere.service.adapter.PageRequestAdapter;
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
    private final TagService service;

    public TagViewer(TagService service)
    {
        this.service = service;
    }

    @GetMapping(value = {"", "/{page}/{size}"})
    public String home(Model model,
            @PathVariable(value = "page", required = false) Integer page,
            @PathVariable(value = "size", required = false) Integer size)

    {
        model.addAttribute("response", service.findAll(PageRequestAdapter.of(page, size)));
        return "tag/home";
    }
}

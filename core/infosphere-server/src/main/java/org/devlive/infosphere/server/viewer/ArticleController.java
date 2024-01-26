package org.devlive.infosphere.server.viewer;

import org.devlive.infosphere.service.entity.UserEntity;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.devlive.infosphere.service.service.ArticleService;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@Component(value = "ArticleViewer")
@RequestMapping(value = "viewer/article")
public class ArticleController
{
    private final ArticleService service;

    public ArticleController(ArticleService service)
    {
        this.service = service;
    }

    @GetMapping(value = "/writer")
    public String writer()
    {
        UserEntity user = UserDetailsService.getUser();
        if (user == null) {
            return "redirect:/viewer/network/403";
        }
        return "article/writer";
    }

    @GetMapping(value = "{code}")
    public String info(Model model,
            @PathVariable String code)
    {
        model.addAttribute("response", service.findArticle(code));
        return "article/info";
    }

    @GetMapping(value = "{code}/edit")
    public String edit(Model model,
            @PathVariable String code)
    {
        UserEntity user = UserDetailsService.getUser();
        if (user == null) {
            return "redirect:/viewer/network/403";
        }

        model.addAttribute("response", service.findArticle(code));
        return "article/writer";
    }
}

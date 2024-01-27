package org.devlive.infosphere.server.viewer;

import org.devlive.infosphere.service.entity.ArticleEntity;
import org.devlive.infosphere.service.entity.UserEntity;
import org.devlive.infosphere.service.repository.ArticleRepository;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.devlive.infosphere.service.service.ArticleService;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;

import javax.servlet.http.HttpServletRequest;

@Controller
@Component(value = "ArticleViewer")
@RequestMapping(value = "viewer/article")
public class ArticleController
{
    private final ArticleRepository repository;
    private final ArticleService service;

    public ArticleController(ArticleRepository repository, ArticleService service)
    {
        this.repository = repository;
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
            HttpServletRequest request,
            @PathVariable String code)
    {
        UserEntity user = UserDetailsService.getUser();
        ArticleEntity entity = repository.findByCode(code);

        // 如果文章未发布或用户未登录或用户不是文章的作者，重定向到403页面
        if (!entity.isPublished() && (user == null || !entity.getUser().getId().equals(user.getId()))) {
            return "redirect:/viewer/network/403";
        }

        model.addAttribute("response", service.findArticle(code, request));
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

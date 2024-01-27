package org.devlive.infosphere.server.viewer;

import org.devlive.infosphere.service.adapter.PageRequestAdapter;
import org.devlive.infosphere.service.entity.UserEntity;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.devlive.infosphere.service.service.ArticleService;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import javax.servlet.http.HttpServletRequest;

@Controller
@Component(value = "IndexViewer")
public class IndexController
{
    private final ArticleService service;

    public IndexController(ArticleService service)
    {
        this.service = service;
    }

    @GetMapping(value = {"/home", "/home/{page}/{size}"})
    public String index(Model model, HttpServletRequest request,
            @PathVariable(value = "page", required = false) Integer page,
            @PathVariable(value = "size", required = false) Integer size)
    {
        stepModel(model, request, page, size);
        return "index";
    }

    @GetMapping(value = {"/hottest", "/hottest/{page}/{size}"})
    public String hottest(Model model, HttpServletRequest request,
            @PathVariable(value = "page", required = false) Integer page,
            @PathVariable(value = "size", required = false) Integer size)
    {
        stepModel(model, request, page, size);
        return "index/hottest";
    }

    @GetMapping(value = {"/recommend", "/recommend/{page}/{size}"})
    public String recommend(Model model, HttpServletRequest request,
            @PathVariable(value = "page", required = false) Integer page,
            @PathVariable(value = "size", required = false) Integer size)
    {
        stepModel(model, request, page, size);
        return "index/recommend";
    }

    @GetMapping(value = {"/forme", "/forme/{page}/{size}"})
    public String forme(Model model, HttpServletRequest request,
            @PathVariable(value = "page", required = false) Integer page,
            @PathVariable(value = "size", required = false) Integer size)
    {
        UserEntity entity = UserDetailsService.getUser();
        // 如果用户未登录跳转到403页面
        if (entity == null) {
            return "redirect:/viewer/network/403";
        }

        stepModel(model, request, page, size);
        return "index/forme";
    }

    private void stepModel(Model model, HttpServletRequest request, Integer page, Integer size)
    {
        String action = request.getRequestURI().substring(1);
        if (action.indexOf('/') > 0) {
            action = action.substring(0, action.indexOf('/'));
        }
        model.addAttribute("activeNavbar", action);
        model.addAttribute("response", service.findAll(action, PageRequestAdapter.of(page, size)));
    }
}

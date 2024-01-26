package org.devlive.infosphere.server.viewer;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class HomeController
{
    @GetMapping(value = {"", "/"})
    public String index()
    {
        return "redirect:/home";
    }
}

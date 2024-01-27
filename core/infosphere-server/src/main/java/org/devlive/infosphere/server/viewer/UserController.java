package org.devlive.infosphere.server.viewer;

import org.springframework.stereotype.Component;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@Component(value = "UserViewer")
@RequestMapping(value = "viewer/user")
public class UserController
{
    @GetMapping(value = "/login")
    public String login()
    {
        return "user/login";
    }

    @GetMapping(value = "register")
    public String register()
    {
        return "user/register";
    }
}

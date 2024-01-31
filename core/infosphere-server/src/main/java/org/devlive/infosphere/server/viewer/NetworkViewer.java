package org.devlive.infosphere.server.viewer;

import org.springframework.stereotype.Component;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@Component(value = "NetworkViewer")
@RequestMapping(value = "viewer/network")
public class NetworkViewer
{
    @GetMapping(value = "403")
    public String f403()
    {
        return "network/403";
    }

    @GetMapping(value = "404")
    public String f404()
    {
        return "network/404";
    }
}

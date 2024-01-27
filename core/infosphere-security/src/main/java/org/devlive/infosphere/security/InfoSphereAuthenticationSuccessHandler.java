package org.devlive.infosphere.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import java.io.IOException;

@Component(value = "infosphereAuthenticationSuccessHandler")
public class InfoSphereAuthenticationSuccessHandler
        implements AuthenticationSuccessHandler
{
    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException
    {
        String accessPath = request.getServletPath();
        HttpSession session = request.getSession();
        // 将授权用户信息抽取到 session 中
        session.setAttribute("userInfo", authentication.getPrincipal());
        response.sendRedirect(accessPath);
    }
}

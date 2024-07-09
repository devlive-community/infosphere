package org.devlive.infosphere.security;

import lombok.extern.slf4j.Slf4j;
import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.common.utils.JsonUtils;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import java.io.IOException;

@Slf4j
@Component
public class JwtAuthEntryPoint
        implements AuthenticationEntryPoint
{
    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException authException)
            throws IOException
    {
        response.setHeader("Content-Type", "application/json;charset=UTF-8");
        log.error("Unauthorized error: {} path [ {} ]", authException.getMessage(), request.getRequestURI());
        if (authException instanceof BadCredentialsException) {
            response.getWriter()
                    .print(JsonUtils.toJSON(CommonResponse.failure("用户账号或密码不匹配")));
        }
        else {
            response.getWriter()
                    .print(JsonUtils.toJSON(CommonResponse.failure("未授权的用户")));
        }
    }
}

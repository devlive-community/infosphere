package org.devlive.infosphere.security;

import lombok.extern.slf4j.Slf4j;
import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.repository.BookRepository;
import org.devlive.infosphere.service.repository.DocumentRepository;
import org.devlive.infosphere.service.security.JwtService;
import org.devlive.infosphere.service.security.impl.UserDetailsServiceImpl;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.annotation.Resource;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import java.io.IOException;

@Slf4j
public class AuthTokenFilterService
        extends OncePerRequestFilter
{
    @Resource
    private JwtService service;
    @Resource
    private BookRepository bookRepository;
    @Resource
    private DocumentRepository documentRepository;
    @Resource
    private UserDetailsServiceImpl userDetailsService;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException
    {
        try {
            String path = request.getRequestURI();
            if (path.matches("/api/v1/book/info/[^/]+")
                    || path.matches("/api/v1/book/catalog/[^/]+")
                    || path.matches("/api/v1/document/info/[^/]+")) {
                String identify = path.substring(path.lastIndexOf('/') + 1);

                BookEntity existsBook = bookRepository.findByIdentifyWithNotOptional(identify);
                if (path.startsWith("/api/v1/document/info")) {
                    existsBook = documentRepository.findByIdentifyWithNotOptional(identify)
                            .getBook();
                }

                if (existsBook != null && existsBook.getVisibility()) {
                    log.info("Book with identify [{}] is visible, proceeding without authentication", identify);
                    if (parseJwt(request) == null) {
                        this.setAnonymous(request);
                    }
                    else {
                        // 如果已经登录，则设置为当前登录的用户
                        this.setUser(request);
                    }
                    filterChain.doFilter(request, response);
                    return;
                }
            }

            this.setUser(request);
        }
        catch (Exception e) {
            logger.error("Cannot set user authentication: {}", e);
        }

        filterChain.doFilter(request, response);
    }

    private String parseJwt(HttpServletRequest request)
    {
        String headerAuth = request.getHeader("Authorization");

        if (StringUtils.hasText(headerAuth) && headerAuth.startsWith("Bearer ")) {
            return headerAuth.substring(7);
        }
        return null;
    }

    /**
     * 设置匿名用户，伪装用户已授权
     *
     * @param request 客户端请求
     */
    private void setAnonymous(HttpServletRequest request)
    {
        UserDetails userDetails = userDetailsService.loadUserByUsername("anonymous@devlive.org");
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                userDetails, null, userDetails.getAuthorities());
        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        SecurityContextHolder.getContext()
                .setAuthentication(authentication);
    }

    private void setUser(HttpServletRequest request)
    {
        String jwt = parseJwt(request);
        if (jwt != null && service.validateJwtToken(jwt)) {
            String username = service.getUserNameFromJwtToken(jwt);
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);
            UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                    userDetails, null, userDetails.getAuthorities());
            authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext()
                    .setAuthentication(authentication);
        }
    }
}

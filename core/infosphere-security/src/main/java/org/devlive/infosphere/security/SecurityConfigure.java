package org.devlive.infosphere.security;

import org.devlive.infosphere.service.processor.SkipAuthenticatedProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder;
import org.springframework.security.config.annotation.method.configuration.EnableGlobalMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityConfigurerAdapter;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableGlobalMethodSecurity(prePostEnabled = true)
public class SecurityConfigure
        extends WebSecurityConfigurerAdapter
{
    private final UserDetailsService userDetailsService;
    private final JwtAuthEntryPoint unauthorizedHandler;
    private final SkipAuthenticatedProcessor skipAuthenticatedProcessor;

    public SecurityConfigure(UserDetailsService userDetailsService, JwtAuthEntryPoint unauthorizedHandler, SkipAuthenticatedProcessor skipAuthenticatedProcessor)
    {
        this.userDetailsService = userDetailsService;
        this.unauthorizedHandler = unauthorizedHandler;
        this.skipAuthenticatedProcessor = skipAuthenticatedProcessor;
    }

    @Bean
    public AuthTokenFilterService authenticationJwtTokenFilter()
    {
        return new AuthTokenFilterService();
    }

    @Override
    public void configure(AuthenticationManagerBuilder authenticationManagerBuilder)
            throws Exception
    {
        authenticationManagerBuilder.userDetailsService(userDetailsService)
                .passwordEncoder(passwordEncoder());
    }

    @Bean
    @Override
    public AuthenticationManager authenticationManagerBean()
            throws Exception
    {
        return super.authenticationManagerBean();
    }

    @Bean
    public PasswordEncoder passwordEncoder()
    {
        return new BCryptPasswordEncoder();
    }

    @Override
    protected void configure(HttpSecurity http)
            throws Exception
    {
        http.cors().and().csrf().disable()
                .exceptionHandling().authenticationEntryPoint(unauthorizedHandler).and()
                .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS).and()
                .authorizeRequests()
                .antMatchers("/", "/**/*.js", "/**/*.css", "/api/auth/**", "/fonts/**", "/static/**",
                        "/api/v1/user/signin", "/api/v1/user/register", "/favicon.ico", "/upload/**",
                        "/api/v1/book/latest/**", "/api/v1/book/public/**", "/api/v1/book/access/**",
                        "/api/v1/book/hottest", "/api/v1/book/newest", "/api/v1/book/user/**", "/api/v1/user/info/**", "/api/v1/book/followed/**",
                        "/api/v1/user/followed/**")
                .permitAll()
                .antMatchers(skipAuthenticatedProcessor.getSkipUrls().toArray(new String[0]))
                .permitAll()
                .anyRequest()
                .authenticated();

        // 添加 JWT 过滤器
        http.addFilterBefore(authenticationJwtTokenFilter(), UsernamePasswordAuthenticationFilter.class);
    }
}

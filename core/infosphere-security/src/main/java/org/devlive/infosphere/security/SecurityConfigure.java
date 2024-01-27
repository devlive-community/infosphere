package org.devlive.infosphere.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder;
import org.springframework.security.config.annotation.method.configuration.EnableGlobalMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityConfigurerAdapter;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import javax.annotation.Resource;

@Configuration
@EnableWebSecurity
@EnableGlobalMethodSecurity(
        prePostEnabled = true)
public class SecurityConfigure
        extends WebSecurityConfigurerAdapter
{
    @Resource
    private UserDetailsService userDetailsService;
    @Resource
    private JwtAuthEntryPoint unauthorizedHandler;
    @Resource
    private InfoSphereAuthenticationProvider infosphereAuthenticationProvider;
    @Resource
    private InfoSphereAuthenticationSuccessHandler authenticationSuccessHandler;

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

    @Autowired
    public void configureGlobal(AuthenticationManagerBuilder auth)
    {
        auth.authenticationProvider(infosphereAuthenticationProvider);
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
//                .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS).and()
                .authorizeRequests()
                .antMatchers("/", "/home/**", "/hottest/**", "/recommend/**", "/forme/**", "/favicon.ico",
                        "/static/**", "/viewer/**",
                        "/api/v1/user/signin", "/api/v1/user/register")
                .permitAll()
                .anyRequest()
                .authenticated()
                .and().formLogin().loginPage("/viewer/user/login").successHandler(authenticationSuccessHandler).permitAll()
                .and().logout().logoutUrl("/viewer/user/logout").logoutSuccessUrl("/").permitAll();
    }
}

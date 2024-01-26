package org.devlive.wikift.security;

import org.devlive.wikift.service.security.UserDetailsService;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Component;

@Component(value = "wikiftAuthenticationProvider")
public class AuthenticationProvider
        implements org.springframework.security.authentication.AuthenticationProvider
{
    @Override
    public Authentication authenticate(Authentication authentication)
            throws AuthenticationException
    {
        UserDetailsService userDetails = (UserDetailsService) authentication.getPrincipal();
        return new UsernamePasswordAuthenticationToken(userDetails.getUsername(), userDetails.getPassword(), userDetails.getAuthorities());
    }

    @Override
    public boolean supports(Class<?> authentication)
    {
        return authentication.equals(UsernamePasswordAuthenticationToken.class);
    }
}
package org.devlive.infosphere.server.configure;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebAppConfigure
        implements WebMvcConfigurer
{
    @Value(value = "${infosphere.cache.home}")
    private String home;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry)
    {
        registry.addResourceHandler("/upload/**")
                .addResourceLocations("file:" + home);
    }
}


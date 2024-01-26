package org.devlive.wikift.server.configure;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Description;
import org.springframework.core.env.Environment;
import org.springframework.util.Assert;
import org.springframework.web.servlet.ViewResolver;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurerAdapter;
import org.thymeleaf.spring5.SpringTemplateEngine;
import org.thymeleaf.spring5.view.ThymeleafViewResolver;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;

@Configuration
public class WebViewerConfigure
        extends WebMvcConfigurerAdapter
{
    private final Environment environment;

    public WebViewerConfigure(Environment environment)
    {
        this.environment = environment;
    }

    @Bean
    @Description("Wikift web viewer configure")
    public ClassLoaderTemplateResolver templateResolver()
    {
        ClassLoaderTemplateResolver templateResolver = new ClassLoaderTemplateResolver();
        String templatePrefix = environment.getProperty("wikift.viewer.prefix");
        Assert.notNull(templatePrefix, "template prefix config must not null");
        templateResolver.setPrefix(templatePrefix);

        String templateSuffix = environment.getProperty("wikift.viewer.suffix");
        Assert.notNull(templateSuffix, "template suffix config must not null");
        templateResolver.setSuffix(templateSuffix);

        boolean templateCacheable = Boolean.parseBoolean(environment.getProperty("wikift.viewer.cache"));
        templateResolver.setCacheable(templateCacheable);

        String templateMode = environment.getProperty("wikift.viewer.mode");
        templateResolver.setTemplateMode(templateMode);

        String templateEncoding = environment.getProperty("wikift.viewer.encoding");
        Assert.notNull(templateSuffix, "template encoding config must not null");
        templateResolver.setCharacterEncoding(templateEncoding);
        return templateResolver;
    }

    @Bean
    public SpringTemplateEngine templateEngine()
    {
        SpringTemplateEngine templateEngine = new SpringTemplateEngine();
        templateEngine.setTemplateResolver(templateResolver());
        return templateEngine;
    }

    @Bean
    public ViewResolver viewResolver()
    {
        ThymeleafViewResolver viewResolver = new ThymeleafViewResolver();
        viewResolver.setTemplateEngine(templateEngine());
        viewResolver.setCharacterEncoding("wikift.viewer.encoding");
        return viewResolver;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry)
    {
        registry.addResourceHandler(environment.getProperty("wikift.viewer.static-relative-location"))
                .addResourceLocations(environment.getProperty("wikift.viewer.static-location"));
        super.addResourceHandlers(registry);
    }
}

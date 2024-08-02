package org.devlive.infosphere.service.processor;

import com.google.common.collect.Sets;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.devlive.infosphere.service.annotation.SkipAuthenticated;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.condition.PathPatternsRequestCondition;
import org.springframework.web.servlet.mvc.condition.PatternsRequestCondition;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import javax.annotation.PostConstruct;

import java.util.HashSet;
import java.util.Set;

@Slf4j
@Component
public class SkipAuthenticatedProcessor
{
    private final RequestMappingHandlerMapping requestMappingHandlerMapping;
    @Getter
    private final Set<String> skipUrls = new HashSet<>();

    public SkipAuthenticatedProcessor(RequestMappingHandlerMapping requestMappingHandlerMapping)
    {
        this.requestMappingHandlerMapping = requestMappingHandlerMapping;
    }

    @PostConstruct
    public void init()
    {
        requestMappingHandlerMapping.getHandlerMethods()
                .forEach((requestMappingInfo, handlerMethod) -> {
                    if (handlerMethod.hasMethodAnnotation(SkipAuthenticated.class)) {
                        Set<String> patterns = getPatternsCondition(requestMappingInfo);
                        log.info("SkipAuthenticated: {}", patterns);
                        skipUrls.addAll(patterns);
                    }
                });
    }

    private Set<String> getPatternsCondition(RequestMappingInfo requestMappingInfo)
    {
        PatternsRequestCondition patternsCondition = requestMappingInfo.getPatternsCondition();
        PathPatternsRequestCondition patternsRequestCondition = requestMappingInfo.getPathPatternsCondition();
        if (patternsCondition != null) {
            return patternsCondition.getPatterns();
        }
        else if (patternsRequestCondition != null) {
            return patternsRequestCondition.getPatternValues();
        }
        else {
            return Sets.newHashSet();
        }
    }
}

package org.devlive.wikift.service;

import com.google.common.cache.CacheBuilder;
import com.google.common.cache.LoadingCache;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.devlive.wikift.common.JwtResponse;
import org.devlive.wikift.service.loader.UserCacheLoader;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

import java.util.concurrent.TimeUnit;

@Slf4j
@Component
public class InitializerConfigure
{
    @Getter
    private LoadingCache<Long, JwtResponse> cache;

    @PostConstruct
    public void init()
    {
        log.info("初始化缓冲");
        cache = CacheBuilder.newBuilder()
                .expireAfterWrite(3600, TimeUnit.MINUTES)
                .maximumSize(Integer.MAX_VALUE)
                .build(new UserCacheLoader());
    }
}

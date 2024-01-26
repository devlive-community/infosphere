package org.devlive.infosphere.service.loader;

import com.google.common.cache.CacheLoader;
import org.devlive.infosphere.common.JwtResponse;

public class UserCacheLoader
        extends CacheLoader<Long, JwtResponse>
{
    @Override
    public JwtResponse load(Long key)
    {
        return null;
    }
}

package org.devlive.infosphere.service.service.impl;

import com.google.common.collect.Sets;
import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.common.utils.NullAwareBeanUtils;
import org.devlive.infosphere.service.adapter.PageAdapter;
import org.devlive.infosphere.service.entity.ArticleAccessEntity;
import org.devlive.infosphere.service.entity.ArticleEntity;
import org.devlive.infosphere.service.entity.TagEntity;
import org.devlive.infosphere.service.entity.UserEntity;
import org.devlive.infosphere.service.repository.ArticleAccessRepository;
import org.devlive.infosphere.service.repository.ArticleRepository;
import org.devlive.infosphere.service.repository.TagRepository;
import org.devlive.infosphere.service.repository.UserRepository;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.devlive.infosphere.service.service.ArticleService;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.util.ObjectUtils;

import javax.servlet.http.HttpServletRequest;
import javax.transaction.Transactional;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class ArticleServiceImpl
        implements ArticleService
{
    private final ArticleRepository repository;
    private final ArticleAccessRepository accessRepository;
    private final UserRepository userRepository;
    private final TagRepository tagRepository;

    public ArticleServiceImpl(ArticleRepository repository, ArticleAccessRepository accessRepository, UserRepository userRepository, TagRepository tagRepository)
    {
        this.repository = repository;
        this.accessRepository = accessRepository;
        this.userRepository = userRepository;
        this.tagRepository = tagRepository;
    }

    @Override
    public CommonResponse<ArticleEntity> save(ArticleEntity entity)
    {
        if (entity.getId() == null) {
            entity.setCode(UUID.randomUUID().toString());
            entity.setUser(UserDetailsService.getUser());
        }
        else {
            repository.findById(entity.getId())
                    .ifPresent(value -> NullAwareBeanUtils.copyNullProperties(value, entity));
        }
        return CommonResponse.success(repository.save(entity));
    }

    @Override
    public CommonResponse<PageAdapter<ArticleEntity>> findAll(String action, Pageable pageable)
    {
        if (action.equals("forme")) {
            return CommonResponse.success(PageAdapter.of(repository.findAllByUserOrderByCreateTimeDesc(UserDetailsService.getUser(), pageable)));
        }
        else if (action.equals("hottest")) {
            return CommonResponse.success(PageAdapter.of(repository.findAllOrderByViewCountDesc(pageable)));
        }
        else {
            return CommonResponse.success(PageAdapter.of(repository.findAllOrderByCreateTimeDesc(pageable)));
        }
    }

    @Override
    public CommonResponse<ArticleEntity> findArticle(String code)
    {
        return CommonResponse.success(repository.findByCode(code));
    }

    @Override
    @Transactional
    public CommonResponse<ArticleEntity> findArticle(String code, HttpServletRequest request)
    {
        ArticleEntity article = repository.findByCode(code);

        ArticleAccessEntity access = new ArticleAccessEntity();
        AtomicReference<UserEntity> user = new AtomicReference<>(UserDetailsService.getUser());
        if (user.get() == null) {
            // 如果未登录用户则使用匿名用户
            userRepository.findById(1L).ifPresent(user::set);
        }
        access.setUser(user.get());
        access.setArticle(article);
        access.setAgent(request.getHeader("user-agent"));
        access.setAddress(this.getIpAddress(request));
        accessRepository.save(access);

        return CommonResponse.success(article);
    }

    @Override
    public CommonResponse<PageAdapter<ArticleAccessEntity>> findAllAccess(String code, Pageable pageable)
    {
        return CommonResponse.success(PageAdapter.of(accessRepository.findAllByArticle(repository.findByCode(code), pageable)));
    }

    @Override
    public CommonResponse<PageAdapter<ArticleEntity>> findAllByTag(String tagCode, Pageable pageable)
    {
        TagEntity tag = tagRepository.findByCode(tagCode);
        return CommonResponse.success(PageAdapter.of(repository.findAllByTags(Sets.newHashSet(tag), pageable)));
    }

    /**
     * 获取访问客户端的 IP 地址
     *
     * @param request 客户端请求
     * @return IP 地址
     */
    private String getIpAddress(HttpServletRequest request)
    {
        String ip = request.getHeader("X-Forwarded-For");
        if (ObjectUtils.isEmpty(ip) || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("Proxy-Client-IP");
        }
        if (ObjectUtils.isEmpty(ip) || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("WL-Proxy-Client-IP");
        }
        if (ObjectUtils.isEmpty(ip) || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("HTTP_X_FORWARDED_FOR");
        }
        if (ObjectUtils.isEmpty(ip) || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("HTTP_X_FORWARDED");
        }
        if (ObjectUtils.isEmpty(ip) || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("HTTP_X_CLUSTER_CLIENT_IP");
        }
        if (ObjectUtils.isEmpty(ip) || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("HTTP_CLIENT_IP");
        }
        if (ObjectUtils.isEmpty(ip) || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("HTTP_FORWARDED_FOR");
        }
        if (ObjectUtils.isEmpty(ip) || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("HTTP_FORWARDED");
        }
        if (ObjectUtils.isEmpty(ip) || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("HTTP_VIA");
        }
        if (ObjectUtils.isEmpty(ip) || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("REMOTE_ADDR");
        }
        if (ObjectUtils.isEmpty(ip) || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        if (ip.contains(",")) {
            return ip.split(",")[0];
        }
        return ip;
    }
}

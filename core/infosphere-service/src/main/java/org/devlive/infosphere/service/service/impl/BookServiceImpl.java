package org.devlive.infosphere.service.service.impl;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.common.utils.NullAwareBeanUtils;
import org.devlive.infosphere.service.adapter.PageAdapter;
import org.devlive.infosphere.service.adapter.PageRequestAdapter;
import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.repository.BookRepository;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.devlive.infosphere.service.service.BookService;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.ObjectUtils;

import javax.servlet.http.HttpServletRequest;

import java.util.List;
import java.util.Optional;

@Service
public class BookServiceImpl
        implements BookService
{
    private final BookRepository repository;

    public BookServiceImpl(BookRepository repository)
    {
        this.repository = repository;
    }

    @Override
    public CommonResponse<PageAdapter<BookEntity>> getAll(Boolean visibility, Boolean excludeUser, Pageable pageable)
    {
        return CommonResponse.success(PageAdapter.of(repository.findAllByCreateTimeDesc(UserDetailsService.getUser(), visibility, excludeUser, pageable)));
    }

    @Transactional
    @Override
    public CommonResponse<BookEntity> getByIdentify(String identify)
    {
        return repository.findByIdentify(identify)
                .map(CommonResponse::success)
                .orElseGet(() -> CommonResponse.failure(String.format("书籍 [ %s ] 不存在", identify)));
    }

    @Override
    public CommonResponse<BookEntity> saveAndUpdate(BookEntity configure)
    {
        Optional<BookEntity> existingBook = repository.findByIdentify(configure.getIdentify());
        if (ObjectUtils.isEmpty(configure.getId())) {
            if (existingBook.isPresent()) {
                return CommonResponse.failure(String.format("书籍标记 [ %s ] 已存在", configure.getIdentify()));
            }
            configure.setUser(UserDetailsService.getUser());
        }

        if (!ObjectUtils.isEmpty(configure.getId()) && existingBook.isPresent()) {
            NullAwareBeanUtils.copyNullProperties(existingBook.get(), configure);
        }

        return CommonResponse.success(repository.save(configure));
    }

    @Override
    public CommonResponse<List<BookEntity>> getTopByCreateTime(Integer top)
    {
        return CommonResponse.success(repository.findTopByCreateTime(PageRequestAdapter.of(0, top)));
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

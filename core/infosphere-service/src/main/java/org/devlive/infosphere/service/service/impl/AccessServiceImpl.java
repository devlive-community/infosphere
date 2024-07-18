package org.devlive.infosphere.service.service.impl;

import eu.bitwalker.useragentutils.UserAgent;
import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.common.utils.IPUtils;
import org.devlive.infosphere.service.entity.AccessEntity;
import org.devlive.infosphere.service.entity.UserEntity;
import org.devlive.infosphere.service.repository.AccessRepository;
import org.devlive.infosphere.service.repository.BookRepository;
import org.devlive.infosphere.service.repository.UserRepository;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.devlive.infosphere.service.service.AccessService;
import org.springframework.stereotype.Service;

import javax.servlet.http.HttpServletRequest;

@Service
public class AccessServiceImpl
        implements AccessService
{
    private final AccessRepository repository;
    private final BookRepository bookRepository;
    private final UserRepository userRepository;

    public AccessServiceImpl(AccessRepository repository, BookRepository bookRepository, UserRepository userRepository)
    {
        this.repository = repository;
        this.bookRepository = bookRepository;
        this.userRepository = userRepository;
    }

    @Override
    public CommonResponse<AccessEntity> save(String identify, HttpServletRequest request)
    {
        return bookRepository.findByIdentify(identify)
                .map(value -> {
                    String userAgent = request.getHeader("User-Agent");
                    UserAgent agent = UserAgent.parseUserAgentString(userAgent);
                    AccessEntity entity = new AccessEntity();
                    entity.setBook(value);
                    UserEntity user = UserDetailsService.getUser();
                    entity.setUser(user);
                    if (user == null) {
                        userRepository.findByEmail("anonymous@devlive.org")
                                .ifPresent(entity::setUser);
                    }
                    entity.setAddress(IPUtils.getIpAddress(request));
                    entity.setClient(agent.getBrowser().getName());
                    entity.setDevice(agent.getBrowser().getName());
                    entity.setType("BOOK");
                    entity.setAgent(userAgent);
                    entity.setLocation(IPUtils.getIP(request));
                    return CommonResponse.success(repository.save(entity));
                })
                .orElseGet(() -> CommonResponse.failure(String.format("书籍 [ %s ] 不存在", identify)));
    }
}

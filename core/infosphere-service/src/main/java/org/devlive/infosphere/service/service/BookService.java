package org.devlive.infosphere.service.service;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.adapter.PageAdapter;
import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.entity.UserEntity;
import org.springframework.data.domain.Pageable;

public interface BookService
{
    CommonResponse<PageAdapter<BookEntity>> getAll(Boolean visibility, Boolean excludeUser, Pageable pageable);

    CommonResponse<PageAdapter<BookEntity>> getAllByUser(String username, Pageable pageable);

    CommonResponse<BookEntity> getByIdentify(String identify);

    CommonResponse<BookEntity> saveAndUpdate(BookEntity configure);

    CommonResponse<PageAdapter<BookEntity>> getNewest(Pageable pageable);

    CommonResponse<PageAdapter<BookEntity>> getHottest(Pageable pageable);

    CommonResponse<PageAdapter<BookEntity>> getFollow(String username, Pageable pageable);

    /**
     * 获取关注书籍的用户列表
     *
     * @param identify 书籍标记
     * @param pageable 分页配置
     * @return 用户列表
     */
    CommonResponse<PageAdapter<UserEntity>> getFans(String identify, Pageable pageable);
}

package org.devlive.infosphere.service.service;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.entity.FollowEntity;

public interface FollowService
{
    /**
     * 关注
     *
     * @param configure 关注信息
     * @return 关注结果
     */
    CommonResponse<FollowEntity> save(FollowEntity configure);

    /**
     * 取消关注
     *
     * @param configure 关注信息
     * @return 取消关注结果
     */
    CommonResponse<Integer> delete(FollowEntity configure);
}

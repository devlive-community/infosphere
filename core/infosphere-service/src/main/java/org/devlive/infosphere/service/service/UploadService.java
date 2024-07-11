package org.devlive.infosphere.service.service;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.body.UploadBody;

public interface UploadService
{
    CommonResponse<Object> upload(UploadBody configure);
}

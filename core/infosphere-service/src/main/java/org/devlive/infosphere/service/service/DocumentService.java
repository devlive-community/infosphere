package org.devlive.infosphere.service.service;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.service.entity.DocumentEntity;

import java.util.List;

public interface DocumentService
{
    CommonResponse<DocumentEntity> saveAndUpdate(DocumentEntity configure);

    /**
     * 根据书籍标识获取文档目录
     *
     * @param identify 书籍标识
     * @return 文档目录
     */
    CommonResponse<List<DocumentEntity>> getCatalogByBook(String identify);

    /**
     * 根据文档标识获取文档
     *
     * @param identify 文档标识
     * @return 文档
     */
    CommonResponse<DocumentEntity> getByIdentify(String identify);
}

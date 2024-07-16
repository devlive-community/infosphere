package org.devlive.infosphere.service.service.impl;

import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.common.utils.NullAwareBeanUtils;
import org.devlive.infosphere.service.entity.BookEntity;
import org.devlive.infosphere.service.entity.DocumentEntity;
import org.devlive.infosphere.service.repository.BookRepository;
import org.devlive.infosphere.service.repository.DocumentRepository;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.devlive.infosphere.service.service.DocumentService;
import org.springframework.stereotype.Service;
import org.springframework.util.ObjectUtils;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class DocumentServiceImpl
        implements DocumentService
{
    private final DocumentRepository repository;
    private final BookRepository bookRepository;

    public DocumentServiceImpl(DocumentRepository repository, BookRepository bookRepository)
    {
        this.repository = repository;
        this.bookRepository = bookRepository;
    }

    @Override
    public CommonResponse<DocumentEntity> saveAndUpdate(DocumentEntity configure)
    {
        Optional<BookEntity> existingBook = bookRepository.findByIdentify(configure.getBook()
                .getIdentify());
        if (!existingBook.isPresent()) {
            return CommonResponse.failure(String.format("书籍 [ %s ] 不存在", configure.getIdentify()));
        }

        Optional<DocumentEntity> existingDocument = repository.findByIdentify(configure.getIdentify());
        if (ObjectUtils.isEmpty(configure.getId())) {
            if (existingDocument.isPresent()) {
                return CommonResponse.failure(String.format("文档标记 [ %s ] 已存在", configure.getIdentify()));
            }
            configure.setUser(UserDetailsService.getUser());
            configure.setBook(existingBook.get());
        }

        if (!ObjectUtils.isEmpty(configure.getId()) && existingDocument.isPresent()) {
            NullAwareBeanUtils.copyNullProperties(existingDocument.get(), configure);
        }

        return CommonResponse.success(repository.save(configure));
    }

    @Override
    public CommonResponse<List<DocumentEntity>> getCatalogByBook(String identify)
    {
        Optional<BookEntity> existingBook = bookRepository.findByIdentify(identify);
        return existingBook.map(book -> CommonResponse.success(buildDocumentTree(book)))
                .orElseGet(() -> CommonResponse.failure(String.format("书籍 [ %s ] 不存在", identify)));
    }

    @Override
    public CommonResponse<DocumentEntity> getByIdentify(String identify)
    {
        return repository.findByIdentify(identify)
                .map(CommonResponse::success)
                .orElseGet(() -> CommonResponse.failure(String.format("文档 [ %s ] 不存在", identify)));
    }

    /**
     * 构建树形结构文档数据
     *
     * @param book 书籍信息
     * @return 树形文档
     */
    public List<DocumentEntity> buildDocumentTree(BookEntity book)
    {
        List<DocumentEntity> documents = repository.findAllByBookOrderBySortingAsc(book);
        List<DocumentEntity> rootDocuments = documents.stream()
                .filter(doc -> doc.getParent() == 0L)
                .collect(Collectors.toList());
        for (DocumentEntity root : rootDocuments) {
            root.setChildren(getChildren(root, documents));
        }
        return rootDocuments;
    }

    private List<DocumentEntity> getChildren(DocumentEntity parent, List<DocumentEntity> documents)
    {
        List<DocumentEntity> children = documents.stream()
                .filter(doc -> doc.getParent().equals(parent.getId()))
                .collect(Collectors.toList());
        for (DocumentEntity child : children) {
            child.setChildren(getChildren(child, documents));
        }
        return children;
    }
}

const express = require('express')
const { asyncHandler } = require('../middleware/async-handler')
const Book = require('../models/book')
const Document = require('../models/document')
const { ensureAuthenticated } = require('../middleware/auth-handler')
const coverUpload = require('../services/upload/cover')
const PaginationHelper = require('../tools/pagination')
const User = require('../models/user')
const marked = require('../lib/extension/marked/marked')
const { isEmpty } = require('lodash')
const router = express.Router()

router.get('/create', ensureAuthenticated, asyncHandler(async (req, res) => {
    res.render('pages/book/info', { isEdit: false })
}))

router.post('/create', ensureAuthenticated, asyncHandler(async (req, res) => {
    try {
        const { title, slug, description, status, is_public } = req.body
        const user_id = req.user.id

        if (!title || !slug) {
            return res.render('pages/book/info', { isEdit: false, error: '标题和 URL 路径是必填项' })
        }

        const slugRegex = /^[a-z0-9-]+$/
        if (!slugRegex.test(slug)) {
            return res.render('pages/book/info', { isEdit: false, error: 'URL 路径只能包含小写字母、数字和连字符' })
        }

        if (slug.startsWith('-') || slug.endsWith('-')) {
            return res.render('pages/book/info', { isEdit: false, error: 'URL 路径不能以连字符开头或结尾' })
        }

        if (slug.includes('--')) {
            return res.render('pages/book/info', { isEdit: false, error: 'URL 路径不能包含连续的连字符' })
        }

        const slugExists = await Book.slugExists(slug)
        if (slugExists) {
            return res.render('pages/book/info', { isEdit: false, error: `URL 路径 ${ slug } 已存在，请使用其他路径` })
        }

        const book = await Book.create({ title, description, slug, user_id, status, is_public })

        const coverFile = req.files?.find(file => file.fieldname === 'cover_image')
        if (coverFile) {
            coverUpload.addTask({
                bookId: book.id,
                userId: user_id,
                provider: 'manual',
                title: title,
                cover: coverFile.buffer,
                coverType: 'buffer'
            })
        }

        res.redirect(`/book/${ book.username }/${ book.slug }`)
    }
    catch (error) {
        console.error('创建书籍失败:', error)
        return res.render('pages/book/info', { isEdit: false, error: '创建书籍失败 ' + error })
    }
}))

router.get('/reader/:username/:book_slug/:docs_slug?', asyncHandler(async (req, res) => {
    const { username, book_slug, docs_slug } = req.params

    const book = await Book.findByUsernameAndSlug(username, book_slug)

    if (!book) {
        return res.status(404).render('pages/error/global', {
            error: {
                status: 404,
                title: '未找到书籍',
                message: '您访问的书籍不存在或已被删除'
            }
        })
    }

    if (book.status === 'draft' && (!req.user || book.user_id !== req.user.id)) {
        return res.status(403).render('pages/error/global', {
            error: {
                status: 403,
                title: '权限不足',
                message: '该书籍尚未公开，您没有权限阅读'
            }
        })
    }

    const searchParams = { book_id: book.id, status: 'published' }
    const documents = await Document.getDocumentTree(searchParams)
    if (documents.length === 0) {
        return res.status(404).render('pages/error/global', {
            error: {
                status: 404,
                title: '无法阅读该书籍',
                message: '该书籍没有任何章节可供阅读'
            }
        })
    }

    let document = documents[0]
    if (docs_slug) {
        document = await Document.findBySlug(docs_slug)
        if (!document) {
            return res.status(404).render('pages/error/global', {
                error: {
                    status: 404,
                    title: '未找到文档',
                    message: '您访问的章节不存在'
                }
            })
        }
    }

    document.html = isEmpty(document.content)
        ? undefined
        : `<link href="https://cdnjs.cloudflare.com/ajax/libs/prism-themes/1.9.0/prism-ghcolors.css" rel="stylesheet"/><script src='https://cdn.tailwindcss.com'></script>` + marked.parse(document.content || '')

    res.render('pages/document/reader', {
        book,
        document,
        documents
    })
}))

router.get('/writer/:username/:book_slug/:doc_slug?', ensureAuthenticated, asyncHandler(async (req, res) => {
    const { username, book_slug, doc_slug } = req.params

    const book = await Book.findByUsernameAndSlug(username, book_slug)
    if (!book) {
        return res.status(404).render('pages/error/global', {
            error: {
                status: 404,
                title: '书籍未找到',
                message: '您请求的书籍不存在'
            }
        })
    }

    if (book.user_id !== req.user.id) {
        return res.status(403).render('pages/error/global', {
            error: {
                status: 403,
                title: '权限不足',
                message: '您没有权限编辑此书籍的文档'
            }
        })
    }

    let document = null
    let isEdit = false
    if (doc_slug) {
        document = await Document.findByBookAndSlug(book.id, doc_slug)
        if (document) {
            isEdit = true
        }
    }

    const searchParams = { book_id: book.id }
    const documents = await Document.getDocumentTree(searchParams)

    const io = req.app.get('io')
    if (io) {
        const userSocket = io.sockets.sockets.get(req.user.socketId)
        if (userSocket) {
            // 加入书籍房间
            userSocket.join(`book-${ book.slug }-room`)

            // 如果编辑已有文档，加入文档房间并广播
            if (document) {
                userSocket.join(`doc-${ document.slug }-room`)
                userSocket.to(`doc-${ document.slug }-room`).emit('user-joined', {
                    userId: req.user.id,
                    username: req.user.username,
                    documentSlug: document.slug
                })
            }
        }
    }

    res.render('pages/document/writer', {
        book,
        document,
        documents,
        isEdit
    })
}))

router.get('/:username', ensureAuthenticated, asyncHandler(async (req, res) => {
    const user = await User.findByUsername(req.params.username)
    if (!user) {
        return res.status(404).render('pages/error/global', {
            error: {
                status: 404,
                title: '用户未找到',
                message: '您请求的用户不存在'
            }
        })
    }

    const paginationParams = PaginationHelper.parseParams(req.query, { defaultLimit: 10 })

    const searchParams = { username: req.params.username }
    if (user.id !== req.user.id) {
        searchParams.is_public = 1
        searchParams.status = 'published'
    }

    const [bookResponse, summaryResponse] = await Promise.all([
        Book.findAllByConditions(paginationParams, searchParams),
        Book.summaryByConditions(searchParams)
    ])
    delete searchParams.username

    res.render('pages/book/self', {
        user,
        data: bookResponse.data,
        searchParams: searchParams,
        summary: summaryResponse,
        pagination: bookResponse.pagination
    })
}))

router.get('/:username/:slug', asyncHandler(async (req, res) => {
    const book = await Book.findByUsernameAndSlug(req.params.username, req.params.slug)

    if (!book) {
        return res.status(404).render('pages/error/global', {
            error: {
                status: 404,
                title: '书籍未找到',
                message: '您请求的书籍不存在'
            }
        })
    }

    await Book.incrementViewCount(book.id)

    res.render('pages/book/summary', {
        book,
        isOwner: req.user && req.user.id === book.user_id
    })
}))

router.get('/:username/:slug/chapters', asyncHandler(async (req, res) => {
    const book = await Book.findByUsernameAndSlug(req.params.username, req.params.slug)
    if (!book) {
        return res.status(404).render('pages/error/global', {
            error: {
                status: 404,
                title: '书籍未找到',
                message: '您请求的书籍不存在'
            }
        })
    }

    const searchParams = { parent_id: null, book_id: book.id }
    if (book.user_id !== req.user?.id) { searchParams.status = 'published' }

    const data = await Document.findAllByConditions(searchParams)

    res.render('pages/book/chapters', { book, data })
}))

router.get('/:username/:slug/edit', ensureAuthenticated, asyncHandler(async (req, res) => {
    const book = await Book.findByUsernameAndSlug(req.params.username, req.params.slug)

    if (!book) {
        return res.status(404).render('pages/error/global', {
            error: {
                status: 404,
                title: '书籍未找到',
                message: '您请求的书籍不存在'
            }
        })
    }

    if (req.user.id !== book.user_id && req.user.role !== 'admin') {
        return res.status(403).render('pages/error/global', {
            error: {
                status: 403,
                title: '权限不足',
                message: '您没有访问此资源的权限'
            }
        })
    }
    res.render('pages/book/info', { isEdit: true, book })
}))

router.put('/:username/:slug/edit', ensureAuthenticated, asyncHandler(async (req, res) => {
    const book = await Book.findByUsernameAndSlug(req.params.username, req.params.slug)
    try {
        const user_id = req.user.id
        if (!book) {
            return res.status(404).render('pages/error/global', {
                error: {
                    status: 404,
                    title: '书籍未找到',
                    message: '您请求的书籍不存在'
                }
            })
        }

        const { title, slug, description, status, is_public, remove_cover } = req.body

        if (!title || !slug) {
            return res.render('pages/book/info', { isEdit: true, book, error: '标题和 URL 路径是必填项' })
        }

        const slugRegex = /^[a-z0-9-]+$/
        if (!slugRegex.test(slug)) {
            return res.render('pages/book/info', { isEdit: false, error: 'URL 路径只能包含小写字母、数字和连字符' })
        }

        if (slug.startsWith('-') || slug.endsWith('-')) {
            return res.render('pages/book/info', { isEdit: false, error: 'URL 路径不能以连字符开头或结尾' })
        }

        if (slug.includes('--')) {
            return res.render('pages/book/info', { isEdit: false, error: 'URL 路径不能包含连续的连字符' })
        }

        const slugExists = await Book.slugExists(slug, book.id)
        if (slugExists) {
            return res.render('pages/book/info', { isEdit: true, book, error: `URL 路径 ${ slug } 已存在，请使用其他路径` })
        }

        const updateData = {
            title,
            slug,
            description,
            status: status || 'draft',
            is_public: is_public === '1'
        }

        const coverFile = req.files?.find(file => file.fieldname === 'cover_image')
        if (coverFile) {
            coverUpload.addTask({
                bookId: book.id,
                userId: user_id,
                provider: 'manual',
                title: title,
                cover: coverFile.buffer,
                coverType: 'buffer'
            })
        }
        else if (parseInt(remove_cover) === 1) {
            updateData.cover_image = null
        }

        await Book.update(book.id, updateData)
        res.redirect(`/book/${ book.username }/${ book.slug }`)
    }
    catch (error) {
        console.error('更新书籍失败:', error)
        return res.render('pages/book/info', { isEdit: true, book, error: `更新书籍失败：${ error }` })
    }
}))

router.delete('/:slug', ensureAuthenticated, asyncHandler(async (req, res) => {
    const book = await Book.findBySlug(req.params.slug)
    const user_id = req.user.id

    if (!book) {
        req.flash('error', `书籍 ${ req.params.slug } 不存在`)
        return res.redirect('/book')
    }

    if (user_id !== book.user_id && req.user.role !== 'admin') {
        req.flash('error', '您没有权限删除此书籍')
        return res.status(403).render('pages/error/global', {
            error: {
                status: 403,
                title: '权限不足',
                message: '您没有访问此资源的权限'
            }
        })
    }

    try {
        await Book.deleteById(book.id)
        req.flash('success', `书籍 ${ book.title } 删除成功`)
        res.redirect('/book')
    }
    catch (error) {
        console.error('删除书籍失败:', error)
        req.flash('error', `书籍 ${ book.title } 删除失败：${ error }`)
        res.redirect('/book')
    }
}))

module.exports = router
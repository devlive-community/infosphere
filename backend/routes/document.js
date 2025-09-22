const express = require('express')
const { asyncHandler } = require('../middleware/async-handler')
const Book = require('../models/book')
const Document = require('../models/document')
const { ensureAuthenticated } = require('../middleware/auth-handler')
const router = express.Router()

router.post('/:username/:book_slug', ensureAuthenticated, asyncHandler(async (req, res) => {
    const { username, book_slug: slug } = req.params
    const { title, content, doc_slug, status = 'draft', parent_id } = req.body

    const book = await Book.findByUsernameAndSlug(username, slug)
    if (!book || book.user_id !== req.user.id) {
        req.flash('error', '权限不足')
        res.status(403).render('pages/error/global', {
            error: {
                status: 403,
                title: '权限不足',
                message: '您没有权限编辑此书籍的文档'
            }
        })
    }

    if (!title || !doc_slug) {
        req.flash('error', '标题和文档路径不能为空')
        return res.redirect(`/book/writer/${ username }/${ slug }`)
    }

    const existingDoc = await Document.findByBookAndSlug(book.id, doc_slug)
    if (existingDoc) {
        req.flash('error', `文档路径 ${ doc_slug } 已存在`)
        return res.redirect(`/book/writer/${ username }/${ slug }`)
    }

    try {
        const document = await Document.create({
            book_id: book.id,
            parent_id: parent_id,
            title,
            content: content || '',
            slug: doc_slug,
            status,
            sort_order: 0,
            user_id: req.user.id
        })

        const io = req.app.get('io')
        if (io) {
            io.to(`book-${ book.slug }-room`).emit('document-created', {
                document,
                user: { id: req.user.id, username: req.user.username }
            })
        }

        req.flash('success', `文档 ${ title } 创建成功`)
        res.redirect(`/book/writer/${ username }/${ slug }/${ doc_slug }`)
    }
    catch (error) {
        console.error('创建文档失败:', error)
        res.redirect(`/book/writer/${ username }/${ slug }`, { 'error': `文档 ${ title } 创建失败：${ error.message }` })
    }
}))

router.put('/:username/:book_slug/:doc_slug', ensureAuthenticated, asyncHandler(async (req, res) => {
    const { username, book_slug: slug, doc_slug } = req.params
    const { title, content, status } = req.body

    const book = await Book.findByUsernameAndSlug(username, slug)
    if (!book || book.user_id !== req.user.id) {
        req.flash('error', '权限不足')
        return res.redirect(`/book/writer/${ username }/${ slug }`)
    }

    const document = await Document.findByBookAndSlug(book.id, doc_slug)
    if (!document) {
        req.flash('error', '文档未找到')
        return res.redirect(`/book/writer/${ username }/${ slug }`)
    }

    try {
        const updateData = { updated_at: new Date() }
        if (title !== undefined) {
            updateData.title = title
        }
        if (content !== undefined) {
            updateData.content = content
        }
        if (status !== undefined) {
            updateData.status = status
        }

        const updatedDocument = await Document.update(document.id, updateData)

        // Socket.IO 实时同步
        const io = req.app.get('io')
        if (io) {
            io.to(`doc-${ document.slug }-room`).emit('document-updated', {
                documentSlug: document.slug,
                content,
                title,
                user: { id: req.user.id, username: req.user.username }
            })
        }

        req.flash('success', '文档保存成功')
        res.redirect(`/book/writer/${ username }/${ slug }/${ doc_slug }`)
    }
    catch (error) {
        console.error('更新文档失败:', error)
        req.flash('error', '保存失败，请重试')
        res.redirect(`/book/writer/${ username }/${ slug }/${ doc_slug }`)
    }
}))

router.delete('/:username/:book_slug/:doc_slug', ensureAuthenticated, asyncHandler(async (req, res) => {
    const { username, book_slug: slug, doc_slug } = req.params

    const book = await Book.findByUsernameAndSlug(username, slug)
    if (!book || book.user_id !== req.user.id) {
        req.flash('error', '权限不足')
        return res.redirect(`/book/writer/${ username }/${ slug }`)
    }

    const document = await Document.findByBookAndSlug(book.id, doc_slug)
    if (!document) {
        req.flash('error', '文档未找到')
        return res.redirect(`/book/writer/${ username }/${ slug }`)
    }

    try {
        // 删除文档
        await Document.delete(document.id)

        // Socket.IO 实时同步
        const io = req.app.get('io')
        if (io) {
            io.to(`book-${ book.slug }-room`).emit('document-deleted', {
                documentSlug: document.slug,
                documentId: document.id,
                user: { id: req.user.id, username: req.user.username }
            })
        }

        req.flash('success', `文档 "${ document.title }" 删除成功`)
        res.redirect(`/book/writer/${ username }/${ slug }`)
    }
    catch (error) {
        console.error('删除文档失败:', error)
        req.flash('error', '删除失败，请重试')
        res.redirect(`/book/writer/${ username }/${ slug }/${ doc_slug }`)
    }
}))

module.exports = router
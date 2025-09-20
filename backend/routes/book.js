const express = require('express')
const { asyncHandler } = require('../middleware/async-handler')
const Book = require('../models/book')
const { ensureAuthenticated } = require('../middleware/auth-handler')
const coverUpload = require('../services/upload/cover')
const router = express.Router()

router.get('/create', ensureAuthenticated, (req, res) => {
    res.render('pages/book/info', { isEdit: false })
})

router.post('/create', ensureAuthenticated, asyncHandler(async (req, res) => {
    try {
        const { title, slug, description, status, is_public } = req.body
        const user_id = req.user.id

        if (!title || !slug) {
            req.flash('error', '标题和 URL 路径是必填项')
            return res.render('pages/book/info', { isEdit: false })
        }

        const slugExists = await Book.slugExists(slug)
        if (slugExists) {
            req.flash('error', `URL 路径 ${ slug } 已存在，请使用其他路径`)
            return res.render('pages/book/info', { isEdit: false })
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
        res.redirect(`/book/${ book.slug }`)
    }
    catch (error) {
        console.error('创建书籍失败:', error)
        req.flash('error', '创建书籍失败 ' + error)
        return res.render('pages/book/info', { isEdit: false })
    }
}))

router.get(['/info/:slug', '/slug/:slug'], asyncHandler(async (req, res) => {
    const book = await Book.findBySlug(req.params.slug)
    if (!book) {
        req.flash('error', `书籍 ${ req.params.slug } 不存在`)
        return res.redirect('/book')
    }

    // 检查访问权限
    if (!book.is_public && (!req.user || req.user.id !== book.user_id)) {
        return res.status(403).render('pages/error/global', {
            error: {
                status: 403,
                title: '权限不足',
                message: '您没有访问此资源的权限'
            }
        })
    }

    // 获取文档树
    // const documents = await Document.getDocumentTree(bookId)

    await Book.incrementViewCount(book.id)

    res.render('pages/book/detail', {
        book,
        // documents,
        user: req.user,
        isOwner: req.user && req.user.id === book.user_id
    })
}))

router.get('/:slug/edit', ensureAuthenticated, asyncHandler(async (req, res) => {
    const book = await Book.findBySlug(req.params.slug)
    if (!book) {
        req.flash('error', `书籍 ${ req.params.slug } 不存在`)
        return res.redirect('/book')
    }

    if (req.user.id !== book.user_id && req.user.role !== 'admin') {
        req.flash('error', '您没有权限编辑此书籍')
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

router.put('/:slug/edit', ensureAuthenticated, asyncHandler(async (req, res) => {
    const book = await Book.findBySlug(req.params.slug)
    try {
        const user_id = req.user.id
        if (!book) {
            req.flash('error', `书籍 ${ req.params.slug } 不存在`)
            return res.redirect('/book')
        }

        if (user_id !== book.user_id && req.user.role !== 'admin') {
            req.flash('error', '您没有权限编辑此书籍')
            return res.status(403).render('pages/error/global', {
                error: {
                    status: 403,
                    title: '权限不足',
                    message: '您没有访问此资源的权限'
                }
            })
        }

        const { title, slug, description, status, is_public, remove_cover } = req.body

        if (!title || !slug) {
            req.flash('error', '标题和 URL 路径是必填项')
            return res.render('pages/book/info', { isEdit: true, book })
        }

        const slugExists = await Book.slugExists(slug, book.id)
        if (slugExists) {
            req.flash('error', `URL 路径 ${ slug } 已存在，请使用其他路径`)
            return res.render('pages/book/info', { isEdit: true, book })
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
        res.redirect(`/book/info/${ book.slug }`)
    }
    catch (error) {
        console.error('更新书籍失败:', error)
        req.flash('error', `更新书籍失败：${ error }`)
        return res.render('pages/book/info', { isEdit: true, book })
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
        res.redirect('/book/my')
    }
    catch (error) {
        console.error('删除书籍失败:', error)
        req.flash('error', `书籍 ${ book.title } 删除失败：${ error }`)
        res.redirect('/book/my')
    }
}))

module.exports = router
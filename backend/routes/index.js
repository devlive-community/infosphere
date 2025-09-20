const express = require('express')
const { asyncHandler } = require('../middleware/async-handler')
const Book = require('../models/book')
const PaginationHelper = require('../tools/pagination')
const router = express.Router()

router.get('/', asyncHandler(async (req, res) => {
    const [stats, hotBooks] = await Promise.all([
        Book.summaryByUser(),
        Book.findTop6ByView()
    ])

    res.render('pages/index', {
        stats,
        hotBooks
    })
}))

router.get('/books', asyncHandler(async (req, res) => {
    const paginationParams = PaginationHelper.parseParams(req.query, {
        defaultLimit: 24
    })

    const searchParams = {
        is_public: 1,
        status: 'published'
    }

    const bookResponse = await Book.findAllByConditions(paginationParams, searchParams)
    delete searchParams.is_public
    delete searchParams.status

    res.render('pages/book/index', {
        data: bookResponse.data,
        pagination: bookResponse.pagination
    })
}))

router.use('/setup', require('./setup'))
router.use('/auth', require('./auth'))
router.use('/user', require('./user'))
router.use('/book', require('./book'))
router.use('/system', require('./system'))

module.exports = router
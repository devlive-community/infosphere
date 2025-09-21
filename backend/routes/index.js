const express = require('express')
const { asyncHandler } = require('../middleware/async-handler')
const Book = require('../models/book')
const router = express.Router()

router.get('/', asyncHandler(async (req, res) => {
    const searchParams = { is_public: 1, status: 'published' }

    const [stats, hotBooks] = await Promise.all([
        Book.summaryByConditions(searchParams),
        Book.findTop6ByView()
    ])

    res.render('pages/index', {
        stats,
        hotBooks
    })
}))

router.use('/setup', require('./setup'))
router.use('/auth', require('./auth'))
router.use('/user', require('./user'))
router.use('/book', require('./book'))
router.use('/document', require('./document'))
router.use('/explore', require('./explore'))
router.use('/system', require('./system'))

module.exports = router
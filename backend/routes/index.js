const express = require('express')
const { asyncHandler } = require('../middleware/async-handler')
const Book = require('../models/book')
const User = require('../models/user')
const router = express.Router()

router.get('/', asyncHandler(async (req, res) => {
    const searchParams = { is_public: 1, status: 'published' }

    const [bookStats, userStats, hotBooks] = await Promise.all([
        Book.summaryByConditions(searchParams),
        User.summaryByConditions({ is_active: 1 }),
        Book.findTop6ByView()
    ])

    res.render('pages/index', {
        bookStats,
        userStats,
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
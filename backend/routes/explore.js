const express = require('express')
const { cloneDeep } = require('lodash')
const { asyncHandler } = require('../middleware/async-handler')
const Book = require('../models/book')
const PaginationHelper = require('../tools/pagination')
const router = express.Router()

router.get('/', asyncHandler(async (req, res) => {
    const paginationParams = PaginationHelper.parseParams(req.query, { defaultLimit: 12 })

    const searchParams = { is_public: 1, status: 'published' }
    const hotParams = cloneDeep(searchParams)
    hotParams.orderBy = { view_count: 'DESC' }

    const [hotResponse, latestResponse] = await Promise.all([
        Book.findAllByConditions(paginationParams, hotParams),
        Book.findAllByConditions(paginationParams, searchParams)
    ])

    res.render('pages/book/explore', {
        hotData: hotResponse.data,
        latestData: latestResponse.data
    })
}))

module.exports = router
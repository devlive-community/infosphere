const express = require('express')
const { asyncHandler } = require('../middleware/async-handler')
const router = express.Router()

router.get('/', asyncHandler(async (req, res) => {
    res.render('pages/index', { title: '首页' })
}))

router.use('/setup', require('./setup'))

module.exports = router
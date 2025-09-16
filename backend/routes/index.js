const express = require('express')
const { asyncHandler } = require('../middleware/async-handler')
const router = express.Router()

router.get('/setup', asyncHandler(async (req, res) => {
    res.render('pages/setup', { title: '安装配置' })
}))

module.exports = router
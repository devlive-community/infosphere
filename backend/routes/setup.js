const express = require('express')
const { asyncHandler } = require('../middleware/async-handler')
const router = express.Router()
const crypto = require('crypto')

router.get('/', asyncHandler(async (req, res) => {
    res.render('pages/setup', {
        title: '系统安装配置',
        secret: crypto.randomBytes(24).toString('hex').toUpperCase()
    })
}))

module.exports = router
const express = require('express')
const { asyncHandler } = require('../middleware/async-handler')
const router = express.Router()

router.get('/', asyncHandler(async (req, res) => {
    res.render('pages/index')
}))

router.use('/setup', require('./setup'))
router.use('/auth', require('./auth'))
router.use('/user', require('./user'))
router.use('/book', require('./book'))
router.use('/system', require('./system'))

module.exports = router
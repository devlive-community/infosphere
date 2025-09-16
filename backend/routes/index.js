const express = require('express')
const router = express.Router()

router.use('/setup', require('./setup'))

module.exports = router
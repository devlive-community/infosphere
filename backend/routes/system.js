const express = require('express')
const router = express.Router()
const { exec } = require('child_process')

router.get('/restart', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h2>系统正在重启中...</h2>
            <p>请稍后刷新页面。</p>
        </div>
    `)

    setTimeout(() => {
        console.log('⚡ 系统正在重启...')
        if (process.env.NODE_ENV === 'production') {
            exec('pm2 restart infosphere', (err, stdout, stderr) => {
                if (err) {
                    console.error('重启失败:', err)
                    return
                }
                console.log('重启结果:', stdout || stderr)
            })
        }
        else {
            console.log('🔄 开发环境: 退出进程，nodemon 将自动重启 backend/app.js')
            process.exit(0)
        }
    }, 1000)
})

module.exports = router
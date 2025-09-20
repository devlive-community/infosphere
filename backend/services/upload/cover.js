const QiniuCoverService = require('../qiniu')

class CoverUpload {
    constructor() {
        this.qiniuService = new QiniuCoverService()
        this.queue = []
        this.processing = false
        this.maxRetries = 3
        this.retryDelay = 5000

        this.startProcessing()
    }

    addTask(taskData) {
        const task = {
            id: `${ taskData.provider || 'manual' }_${ taskData.bookId }_${ Date.now() }`,
            bookId: taskData.bookId,
            userId: taskData.userId,
            provider: taskData.provider || 'manual', // manual, douban, amazon, etc.
            title: taskData.title,
            cover: taskData.cover, // 可以是URL或Buffer
            coverType: taskData.coverType || 'url', // url or buffer
            retries: 0,
            createdAt: new Date(),
            status: 'pending'
        }

        const existingTask = this.queue.find(t =>
            t.bookId === task.bookId &&
            t.cover === task.cover
        )

        if (existingTask) {
            console.log(`Cover upload task already exists for book ${ task.bookId }, skipping`)
            return false
        }

        this.queue.push(task)
        console.log(`Added cover upload task for book ${ task.bookId } (${ task.provider }). Queue size: ${ this.queue.length }`)

        if (!this.processing) {
            this.startProcessing()
        }

        return true
    }

    startProcessing() {
        if (this.processing || this.queue.length === 0) {
            return
        }

        this.processing = true
        this.processNext()
    }

    async processNext() {
        if (this.queue.length === 0) {
            this.processing = false
            console.log('Cover upload queue processing completed')
            return
        }

        const task = this.queue.shift()

        try {
            console.log(`Processing cover upload task: ${ task.id }`)
            task.status = 'processing'

            // 检查是否已经是七牛云URL
            if (typeof task.cover === 'string' && task.cover.includes(process.env.QINIU_DOMAIN)) {
                console.log(`Cover already on Qiniu Cloud for task ${ task.id }, skipping`)
                task.status = 'skipped'
            }
            else {
                const qiniuUrl = await this.qiniuService.processCoverTask({
                    bookId: task.bookId,
                    userId: task.userId,
                    provider: task.provider,
                    title: task.title,
                    cover: task.cover,
                    coverType: task.coverType
                })

                if (qiniuUrl && (typeof task.cover !== 'string' || qiniuUrl !== task.cover)) {
                    console.log(`Successfully processed cover for book ${ task.bookId }: ${ qiniuUrl }`)
                    task.status = 'completed'
                    task.qiniuUrl = qiniuUrl
                }
                else {
                    console.log(`No change needed for cover task ${ task.id }`)
                    task.status = 'completed'
                }
            }
        }
        catch (error) {
            console.error(`Failed to process cover upload task ${ task.id }:`, error.message)

            task.retries++
            if (task.retries < this.maxRetries) {
                task.status = 'retry'
                console.log(`Retrying task ${ task.id } (attempt ${ task.retries }/${ this.maxRetries })`)

                setTimeout(() => {
                    task.status = 'pending'
                    this.queue.push(task)
                }, this.retryDelay)
            }
            else {
                console.error(`Task ${ task.id } failed after ${ this.maxRetries } attempts. Giving up.`)
                task.status = 'failed'
                task.lastError = error.message
            }
        }

        setTimeout(() => {
            this.processNext()
        }, 1000)
    }

    /**
     * 直接上传封面（同步方式）
     * @param {Object} taskData 任务数据
     * @returns {Promise<string>} 返回七牛云URL
     */
    async uploadCoverSync(taskData) {
        try {
            const qiniuUrl = await this.qiniuService.processCoverTask({
                bookId: taskData.bookId,
                userId: taskData.userId,
                provider: taskData.provider || 'manual',
                title: taskData.title,
                cover: taskData.cover,
                coverType: taskData.coverType || 'url'
            })

            return qiniuUrl
        }
        catch (error) {
            console.error(`Failed to upload cover sync for book ${ taskData.bookId }:`, error.message)
            throw error
        }
    }

    getStatus() {
        return {
            queueLength: this.queue.length,
            processing: this.processing,
            pendingTasks: this.queue.filter(task => task.status === 'pending').length,
            processingTasks: this.queue.filter(task => task.status === 'processing').length,
            retryTasks: this.queue.filter(task => task.status === 'retry').length,
            failedTasks: this.queue.filter(task => task.status === 'failed').length,
            completedTasks: this.queue.filter(task => task.status === 'completed').length,
            skippedTasks: this.queue.filter(task => task.status === 'skipped').length
        }
    }

    clearQueue() {
        const beforeLength = this.queue.length
        this.queue = []
        console.log(`Cleared ${ beforeLength } tasks from cover upload queue`)
        return beforeLength
    }

    clearFailedTasks() {
        const beforeLength = this.queue.length
        this.queue = this.queue.filter(task => task.status !== 'failed')
        const cleared = beforeLength - this.queue.length
        console.log(`Cleared ${ cleared } failed tasks from cover upload queue`)
        return cleared
    }

    retryFailedTasks() {
        const failedTasks = this.queue.filter(task => task.status === 'failed')

        failedTasks.forEach(task => {
            task.status = 'pending'
            task.retries = 0
            task.lastError = null
        })

        console.log(`Reset ${ failedTasks.length } failed tasks for retry`)

        if (failedTasks.length > 0 && !this.processing) {
            this.startProcessing()
        }

        return failedTasks.length
    }

    getQueueDetails() {
        return this.queue.map(task => ({
            id: task.id,
            bookId: task.bookId,
            userId: task.userId,
            provider: task.provider,
            status: task.status,
            retries: task.retries,
            createdAt: task.createdAt,
            lastError: task.lastError,
            qiniuUrl: task.qiniuUrl
        }))
    }
}

const coverUpload = new CoverUpload()

module.exports = coverUpload
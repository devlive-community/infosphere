const QiniuAvatarService = require('../qiniu')

class AvatarUpload {
    constructor() {
        this.qiniuService = new QiniuAvatarService()
        this.queue = []
        this.processing = false
        this.maxRetries = 3
        this.retryDelay = 5000

        this.startProcessing()
    }

    addTask(taskData) {
        const task = {
            id: `${ taskData.provider }_${ taskData.provider_id }_${ Date.now() }`,
            userId: taskData.userId,
            provider: taskData.provider,
            provider_id: taskData.provider_id,
            username: taskData.username,
            avatar: taskData.avatar,
            retries: 0,
            createdAt: new Date(),
            status: 'pending'
        }

        const existingTask = this.queue.find(t =>
            t.userId === task.userId &&
            t.provider === task.provider &&
            t.avatar === task.avatar
        )

        if (existingTask) {
            console.log(`Task already exists for user ${ task.userId } provider ${ task.provider }, skipping`)
            return false
        }

        this.queue.push(task)
        console.log(`Added avatar upload task for user ${ task.userId } (${ task.provider }). Queue size: ${ this.queue.length }`)

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
            console.log('Avatar upload queue processing completed')
            return
        }

        const task = this.queue.shift()

        try {
            console.log(`Processing avatar upload task: ${ task.id }`)
            task.status = 'processing'

            if (task.avatar.includes(process.env.QINIU_DOMAIN)) {
                console.log(`Avatar already on Qiniu Cloud for task ${ task.id }, skipping`)
                task.status = 'skipped'
            }
            else {
                const qiniuUrl = await this.qiniuService.processAvatarTask({
                    userId: task.userId,
                    provider: task.provider,
                    provider_id: task.provider_id,
                    username: task.username,
                    avatar: task.avatar
                })

                if (qiniuUrl && qiniuUrl !== task.avatar) {
                    console.log(`Successfully processed avatar for user ${ task.userId }: ${ qiniuUrl }`)
                    task.status = 'completed'
                }
                else {
                    console.log(`No change needed for avatar task ${ task.id }`)
                    task.status = 'completed'
                }
            }
        }
        catch (error) {
            console.error(`Failed to process avatar upload task ${ task.id }:`, error.message)

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
        console.log(`Cleared ${ beforeLength } tasks from avatar upload queue`)
        return beforeLength
    }

    clearFailedTasks() {
        const beforeLength = this.queue.length
        this.queue = this.queue.filter(task => task.status !== 'failed')
        const cleared = beforeLength - this.queue.length
        console.log(`Cleared ${ cleared } failed tasks from avatar upload queue`)
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
            userId: task.userId,
            provider: task.provider,
            status: task.status,
            retries: task.retries,
            createdAt: task.createdAt,
            lastError: task.lastError
        }))
    }
}

const avatarUpload = new AvatarUpload()

module.exports = avatarUpload
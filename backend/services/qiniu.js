const qiniu = require('qiniu')
const axios = require('axios')
const crypto = require('crypto')
const User = require('../models/user')
const Book = require('../models/book')

class QiniuService {
    constructor() {
        // Qiniu Cloud configuration
        this.accessKey = process.env.QINIU_ACCESS_KEY
        this.secretKey = process.env.QINIU_SECRET_KEY
        this.bucket = process.env.QINIU_BUCKET || 'infosphere'
        this.domain = process.env.QINIU_DOMAIN

        // Initialize configuration
        this.mac = new qiniu.auth.digest.Mac(this.accessKey, this.secretKey)
        this.config = new qiniu.conf.Config()
        this.config.zone = qiniu.zone.Zone_z1 // Adjust based on your storage region

        this.bucketManager = new qiniu.rs.BucketManager(this.mac, this.config)
        this.formUploader = new qiniu.form_up.FormUploader(this.config)
    }

    /**
     * Generate file key for avatar
     * @param {string} userId User ID
     * @param {string} provider Provider (github, google, etc.)
     * @param {string} originalUrl Original avatar URL
     * @returns {string} File key
     */
    generateAvatarKey(userId, provider, originalUrl) {
        const ext = this.getFileExtension(originalUrl)
        const randomId = crypto.randomBytes(8).toString('hex')
        return `infosphere/images/avatars/${ provider }/${ randomId }.${ ext }`
    }

    /**
     * Generate file key for book cover
     * @param {string} bookId Book ID
     * @param {string} provider Provider (manual, douban, amazon, etc.)
     * @param {string} originalUrl Original cover URL or filename
     * @returns {string} File key
     */
    generateCoverKey(bookId, provider, originalUrl) {
        const ext = this.getFileExtension(originalUrl)
        const randomId = crypto.randomBytes(8).toString('hex')
        return `infosphere/images/cover/${ provider }/${ randomId }.${ ext }`
    }

    /**
     * Get file extension from URL or filename
     * @param {string} url
     * @returns {string}
     */
    getFileExtension(url) {
        if (!url) {
            return 'jpg'
        }

        // Extract extension from URL or filename
        const match = url.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)
        if (match) {
            return match[1].toLowerCase()
        }

        // Default to jpg
        return 'jpg'
    }

    /**
     * Check if file exists
     * @param {string} key File key
     * @returns {Promise<boolean>}
     */
    async fileExists(key) {
        return new Promise((resolve) => {
            this.bucketManager.stat(this.bucket, key, (err, respBody, respInfo) => {
                if (err) {
                    resolve(false)
                }
                else if (respInfo.statusCode === 200) {
                    resolve(true)
                }
                else {
                    resolve(false)
                }
            })
        })
    }

    /**
     * Delete file from Qiniu Cloud
     * @param {string} key File key
     * @returns {Promise<boolean>}
     */
    async deleteFile(key) {
        return new Promise((resolve, reject) => {
            this.bucketManager.delete(this.bucket, key, (err, respBody, respInfo) => {
                if (err) {
                    reject(err)
                }
                else if (respInfo.statusCode === 200) {
                    resolve(true)
                }
                else {
                    resolve(false)
                }
            })
        })
    }

    /**
     * Upload buffer data to Qiniu Cloud
     * @param {Buffer} buffer Data buffer
     * @param {string} key Target file key
     * @param {boolean} overwrite Whether to overwrite existing file
     * @returns {Promise<string>} Returns Qiniu Cloud URL
     */
    async uploadBuffer(buffer, key, overwrite = true) {
        try {
            // If overwrite is enabled and file exists, delete first
            if (overwrite) {
                const exists = await this.fileExists(key)
                if (exists) {
                    console.log(`File ${ key } already exists, deleting...`)
                    await this.deleteFile(key)
                }
            }

            // Validate buffer size (limit to 10MB for images)
            if (buffer.length > 10 * 1024 * 1024) {
                throw new Error('File too large, exceeds 10MB limit')
            }

            // Generate upload token
            const putPolicy = new qiniu.rs.PutPolicy({
                scope: `${ this.bucket }:${ key }`,
                expires: 3600 // 1-hour validity
            })
            const uploadToken = putPolicy.uploadToken(this.mac)

            // Upload to Qiniu Cloud
            console.log(`Uploading buffer to Qiniu Cloud: ${ key }`)
            return new Promise((resolve, reject) => {
                const putExtra = new qiniu.form_up.PutExtra()

                this.formUploader.put(uploadToken, key, buffer, putExtra, (err, respBody, respInfo) => {
                    if (err) {
                        console.error('Qiniu Cloud upload error:', err)
                        reject(err)
                    }
                    else if (respInfo.statusCode === 200) {
                        const qiniuUrl = `${ this.domain }/${ key }`
                        console.log(`Upload successful: ${ qiniuUrl }`)
                        resolve(qiniuUrl)
                    }
                    else {
                        console.error('Qiniu Cloud upload failed:', respInfo.statusCode, respBody)
                        reject(new Error(`Upload failed: ${ respInfo.statusCode }`))
                    }
                })
            })

        }
        catch (error) {
            console.error('Failed to upload buffer to Qiniu Cloud:', error.message)
            throw error
        }
    }

    /**
     * Download image from URL and upload to Qiniu Cloud
     * @param {string} imageUrl Original image URL
     * @param {string} key Target file key
     * @param {boolean} overwrite Whether to overwrite existing file
     * @returns {Promise<string>} Returns Qiniu Cloud URL
     */
    async uploadFromUrl(imageUrl, key, overwrite = true) {
        try {
            // Download original image
            console.log(`Downloading image: ${ imageUrl }`)
            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'InfoSphere-Image-Uploader'
                }
            })

            const imageBuffer = Buffer.from(response.data)
            return await this.uploadBuffer(imageBuffer, key, overwrite)

        }
        catch (error) {
            console.error('Failed to upload image from URL to Qiniu Cloud:', error.message)
            throw error
        }
    }

    /**
     * Process user avatar upload task
     * @param {Object} task Task information from avatar uploader
     * @returns {Promise<string>} Returns new avatar URL
     */
    async processAvatarTask(task) {
        try {
            const { userId, provider, provider_id, username, avatar } = task

            if (!avatar || !avatar.startsWith('http')) {
                console.log(`User ${ userId } does not have a valid avatar URL, skipping upload`)
                return avatar
            }

            // Check if it's already a Qiniu Cloud URL
            if (avatar.includes(this.domain)) {
                console.log(`User ${ userId } avatar is already on Qiniu Cloud, skipping upload`)
                return avatar
            }

            const key = this.generateAvatarKey(userId, provider, avatar)
            const qiniuUrl = await this.uploadFromUrl(avatar, key, true)

            // Update user's avatar in database
            await User.update(userId, { avatar: qiniuUrl })

            console.log(`Successfully updated avatar for user ${ userId }: ${ qiniuUrl }`)
            return qiniuUrl
        }
        catch (error) {
            console.error(`Failed to process avatar for user ${ task.userId }:`, error.message)
            // Return original URL if upload fails
            return task.avatar
        }
    }

    /**
     * Process book cover upload task
     * @param {Object} task Task information from cover uploader
     * @returns {Promise<string>} Returns new cover URL
     */
    async processCoverTask(task) {
        try {
            const { bookId, userId, provider, title, cover, coverType } = task

            if (!cover) {
                console.log(`Book ${ bookId } does not have a valid cover, skipping upload`)
                return null
            }

            // Check if it's already a Qiniu Cloud URL
            if (typeof cover === 'string' && cover.includes(this.domain)) {
                console.log(`Book ${ bookId } cover is already on Qiniu Cloud, skipping upload`)
                return cover
            }

            const key = this.generateCoverKey(bookId, provider, typeof cover === 'string' ? cover : 'cover.jpg')
            let qiniuUrl

            if (coverType === 'buffer' && Buffer.isBuffer(cover)) {
                // Upload from buffer (file upload)
                qiniuUrl = await this.uploadBuffer(cover, key, true)
            }
            else if (typeof cover === 'string' && cover.startsWith('http')) {
                // Upload from URL
                qiniuUrl = await this.uploadFromUrl(cover, key, true)
            }
            else {
                throw new Error('Invalid cover data type')
            }

            // Update book's cover in database if Book model exists
            if (Book && Book.update) {
                await Book.update(bookId, { cover_image: qiniuUrl })
                console.log(`Successfully updated cover for book ${ bookId }: ${ qiniuUrl }`)
            }

            return qiniuUrl
        }
        catch (error) {
            console.error(`Failed to process cover for book ${ task.bookId }:`, error.message)
            // Return original URL if upload fails and it's a string
            return typeof task.cover === 'string' ? task.cover : null
        }
    }

    /**
     * Process user avatar (legacy method for backward compatibility)
     * @param {Object} user User information
     * @returns {Promise<string>} Returns new avatar URL
     */
    async processAvatar(user) {
        try {
            if (!user.avatar || !user.avatar.startsWith('http')) {
                console.log('User does not have a valid avatar URL, skipping upload')
                return user.avatar
            }

            // Check if it's already a Qiniu Cloud URL
            if (user.avatar.includes(this.domain)) {
                console.log('Avatar is already on Qiniu Cloud, skipping upload')
                return user.avatar
            }

            // For legacy support, use 'unknown' as provider if not specified
            const provider = user.provider || 'unknown'
            const key = this.generateAvatarKey(user.id, provider, user.avatar)
            const qiniuUrl = await this.uploadFromUrl(user.avatar, key, true)

            return qiniuUrl
        }
        catch (error) {
            console.error(`Failed to process avatar for user ${ user.id }:`, error.message)
            // Return original URL if upload fails
            return user.avatar
        }
    }

    /**
     * Process book cover (direct method)
     * @param {Object} coverData Cover information
     * @returns {Promise<string>} Returns new cover URL
     */
    async processCover(coverData) {
        try {
            const { bookId, provider = 'manual', cover, coverType = 'url' } = coverData

            if (!cover) {
                console.log('No cover data provided, skipping upload')
                return null
            }

            // Check if it's already a Qiniu Cloud URL
            if (typeof cover === 'string' && cover.includes(this.domain)) {
                console.log('Cover is already on Qiniu Cloud, skipping upload')
                return cover
            }

            const key = this.generateCoverKey(bookId, provider, typeof cover === 'string' ? cover : 'cover.jpg')
            let qiniuUrl

            if (coverType === 'buffer' && Buffer.isBuffer(cover)) {
                qiniuUrl = await this.uploadBuffer(cover, key, true)
            }
            else if (typeof cover === 'string' && cover.startsWith('http')) {
                qiniuUrl = await this.uploadFromUrl(cover, key, true)
            }
            else {
                throw new Error('Invalid cover data type')
            }

            return qiniuUrl
        }
        catch (error) {
            console.error(`Failed to process cover:`, error.message)
            return typeof coverData.cover === 'string' ? coverData.cover : null
        }
    }
}

module.exports = QiniuService
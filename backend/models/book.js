const { getPool } = require('../tools/db')
const PaginationHelper = require('../tools/pagination')

class Book {
    /**
     * 创建书籍
     * @param {Object} bookData 书籍数据
     * @returns {Promise<number>} 插入的书籍
     */
    static async create(bookData) {
        const { title, description, cover_image, slug, user_id, status = 'draft', is_public = false } = bookData

        try {
            const pool = getPool()
            const connection = await pool.getConnection()

            const [result] = await connection.execute(
                'INSERT INTO books (title, description, cover_image, slug, user_id, status, is_public) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [title, description || null, cover_image || null, slug, user_id, status, is_public]
            )
            connection.release()

            return await this.findBySlug(slug)
        }
        catch (error) {
            console.error('创建书籍失败:', error)
            throw error
        }
    }

    /**
     * 根据ID查找书籍
     * @param {number} id 书籍ID
     * @returns {Promise<Object|null>} 书籍对象
     */
    static async findById(id) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(
                'SELECT * FROM books WHERE id = ?',
                [id]
            )
            connection.release()

            return rows.length > 0 ? rows[0] : null
        }
        catch (error) {
            console.error(`根据ID查找书籍失败 ${ id }:`, error)
            throw error
        }
    }

    /**
     * 根据slug查找书籍
     * @param {string} slug 书籍slug
     * @returns {Promise<Object|null>} 书籍对象
     */
    static async findBySlug(slug) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(`
                  SELECT b.*,
                         DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                         u.username,
                         u.avatar,
                         u.email
                  FROM books b
                           LEFT JOIN users u ON b.user_id = u.id
                  WHERE b.slug = ?
                `,
                [slug]
            )
            connection.release()

            return rows.length > 0 ? rows[0] : null
        }
        catch (error) {
            console.error(`根据slug查找书籍失败 ${ slug }:`, error)
            throw error
        }
    }

    static async findByUsernameAndSlug(username, slug) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(`
                SELECT b.*,
                       DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                       u.username,
                       u.avatar,
                       u.email
                FROM books b
                         LEFT JOIN users u ON b.user_id = u.id
                WHERE u.username = ?
                  AND b.slug = ?
            `, [username, slug])
            connection.release()

            return rows.length > 0 ? rows[0] : null
        }
        catch (error) {
            console.error(`根据slug查找书籍失败 ${ slug }:`, error)
            throw error
        }
    }

    static async findAllByConditions(paginationParams = null, searchParams = {}) {
        try {
            const pool = getPool()

            let whereConditions = []
            let params = []

            // 根据用户ID过滤
            if (searchParams.user_id) {
                whereConditions.push('b.user_id = ?')
                params.push(searchParams.user_id)
            }

            // 根据标题搜索
            if (searchParams.title) {
                whereConditions.push('b.title LIKE ?')
                params.push(`%${ searchParams.title }%`)
            }

            // 根据状态过滤
            if (searchParams.status) {
                whereConditions.push('b.status = ?')
                params.push(searchParams.status)
            }

            // 根据可见性过滤
            if (searchParams.is_public !== undefined) {
                whereConditions.push('b.is_public = ?')
                params.push(searchParams.is_public)
            }

            // 根据作者用户名搜索
            if (searchParams.username) {
                whereConditions.push('u.username LIKE ?')
                params.push(`%${ searchParams.username }%`)
            }

            // 根据描述搜索
            if (searchParams.description) {
                whereConditions.push('b.description LIKE ?')
                params.push(`%${ searchParams.description }%`)
            }

            // 根据slug搜索
            if (searchParams.slug) {
                whereConditions.push('b.slug LIKE ?')
                params.push(`%${ searchParams.slug }%`)
            }

            const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''

            const baseQuery = `
                SELECT b.id,
                       b.title,
                       b.description,
                       b.cover_image,
                       b.slug,
                       b.status,
                       b.is_public,
                       b.view_count,
                       DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                       DATE_FORMAT(b.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
                       b.user_id,
                       u.username,
                       u.avatar,
                       u.email
                FROM books b
                         LEFT JOIN users u ON b.user_id = u.id
                    ${ whereClause }
                ORDER BY b.created_at DESC
            `

            const countQuery = `
                SELECT COUNT(*) as total
                FROM books b
                         LEFT JOIN users u ON b.user_id = u.id
                    ${ whereClause }
            `

            let result
            if (paginationParams) {
                result = await PaginationHelper.executePaginatedQuery(
                    pool, baseQuery, countQuery, params, paginationParams
                )
            }
            else {
                const connection = await pool.getConnection()
                const [rows] = await connection.execute(baseQuery, params)
                connection.release()

                result = { data: rows, pagination: null }
            }

            return result
        }
        catch (error) {
            console.error(`根据条件查找书籍失败:`, error)
            throw error
        }
    }

    static async summaryByUser(user_id = null) {
        try {
            const whereConditions = []
            const values = []

            if (user_id) {
                whereConditions.push('user_id = ?')
                values.push(user_id)
            }
            else {
                whereConditions.push('is_public = ?')
                values.push(1)
                whereConditions.push('status = ?')
                values.push('published')
            }

            const whereClause = 'WHERE ' + whereConditions.join(' AND ')

            const pool = getPool()
            const [rows] = await pool.query(`
                SELECT COUNT(*)                                                       as total_books,
                       SUM(view_count)                                                as total_views,
                       SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END)          as published_count,
                       SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END)              as draft_count,
                       SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END)           as archived_count,
                       SUM(CASE WHEN status = 'published' THEN view_count ELSE 0 END) as published_views,
                       SUM(CASE WHEN status = 'draft' THEN view_count ELSE 0 END)     as draft_views,
                       SUM(CASE WHEN status = 'archived' THEN view_count ELSE 0 END)  as archived_views
                FROM books ${ whereClause }
            `, values)

            return rows[0]
        }
        catch (error) {
            throw error
        }
    }

    static async findTop6ByView() {
        const pool = getPool()
        const [rows] = await pool.query(`
            SELECT b.id,
                   b.title,
                   b.description,
                   b.cover_image,
                   b.slug,
                   b.status,
                   b.is_public,
                   b.view_count,
                   DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                   DATE_FORMAT(b.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
                   b.user_id,
                   u.username,
                   u.avatar,
                   u.email
            FROM books b
                     LEFT JOIN users u ON b.user_id = u.id
            WHERE b.is_public = TRUE
              AND b.status = 'published'
            ORDER BY b.view_count DESC LIMIT 6
        `)

        return rows
    }

    /**
     * 查找所有公开书籍
     * @param {Object} options 查询选项
     * @returns {Promise<Array>} 书籍数组
     */
    static async findPublic(options = {}) {
        try {
            const { limit = null, offset = 0, orderBy = 'created_at', order = 'DESC' } = options

            const pool = getPool()
            const connection = await pool.getConnection()

            let sql = `SELECT *
                       FROM books
                       WHERE is_public = 1
                         AND status = 'published'
                       ORDER BY ${ orderBy } ${ order }`

            if (limit) {
                sql += ` LIMIT ${ limit } OFFSET ${ offset }`
            }

            const [rows] = await connection.execute(sql)
            connection.release()

            return rows
        }
        catch (error) {
            console.error('查找公开书籍失败:', error)
            throw error
        }
    }

    /**
     * 更新书籍
     * @param {number} id 书籍ID
     * @param {Object} bookData 更新数据
     * @returns {Promise<boolean>} 是否成功
     */
    static async update(id, bookData) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()

            const fields = []
            const values = []

            if (bookData.title !== undefined) {
                fields.push('title = ?')
                values.push(bookData.title)
            }
            if (bookData.description !== undefined) {
                fields.push('description = ?')
                values.push(bookData.description)
            }
            if (bookData.cover_image !== undefined) {
                fields.push('cover_image = ?')
                values.push(bookData.cover_image)
            }
            if (bookData.slug !== undefined) {
                fields.push('slug = ?')
                values.push(bookData.slug)
            }
            if (bookData.status !== undefined) {
                fields.push('status = ?')
                values.push(bookData.status)
            }
            if (bookData.is_public !== undefined) {
                fields.push('is_public = ?')
                values.push(bookData.is_public)
            }

            if (fields.length === 0) {
                throw new Error('没有提供要更新的字段')
            }

            fields.push('updated_at = CURRENT_TIMESTAMP')
            values.push(id)

            const [result] = await connection.execute(
                `UPDATE books
                 SET ${ fields.join(', ') }
                 WHERE id = ?`,
                values
            )
            connection.release()

            return result.affectedRows > 0
        }
        catch (error) {
            console.error(`更新书籍失败 ${ id }:`, error)
            throw error
        }
    }

    /**
     * 删除书籍
     * @param {number} id 书籍ID
     * @returns {Promise<boolean>} 是否成功
     */
    static async deleteById(id) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [result] = await connection.execute(
                'DELETE FROM books WHERE id = ?',
                [id]
            )
            connection.release()

            return result.affectedRows > 0
        }
        catch (error) {
            console.error(`删除书籍失败 ${ id }:`, error)
            throw error
        }
    }

    /**
     * 检查slug是否存在
     * @param {string} slug
     * @param {number} excludeId 排除的书籍ID
     * @returns {Promise<boolean>} 是否存在
     */
    static async slugExists(slug, excludeId = undefined) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()

            let sql = 'SELECT COUNT(*) as count FROM books WHERE slug = ?'
            let params = [slug]

            if (excludeId) {
                sql += ' AND id != ?'
                params.push(excludeId)
            }

            const [rows] = await connection.execute(sql, params)
            connection.release()

            return rows[0].count > 0
        }
        catch (error) {
            console.error(`检查slug是否存在失败 ${ slug }:`, error)
            throw error
        }
    }

    static async incrementViewCount(id) {
        try {
            const pool = getPool()
            await pool.query(
                `UPDATE books
                 SET view_count = view_count + 1
                 WHERE id = ?`,
                [id]
            )
        }
        catch (error) {
            console.error('Increment view count error:', error)
        }
    }
}

module.exports = Book
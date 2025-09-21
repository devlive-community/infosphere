const { getPool } = require('../tools/db')

class Document {
    /**
     * 创建文档
     * @param {Object} docData 文档数据
     * @returns {Promise<number>} 插入的文档ID
     */
    static async create(docData) {
        const { book_id, parent_id, title, slug, content, user_id, sort_order = 0, status = 'draft' } = docData

        try {
            const pool = getPool()
            const connection = await pool.getConnection()

            const [result] = await connection.execute(
                'INSERT INTO documents (book_id, parent_id, title, slug, content, user_id, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [book_id, parent_id, title, slug, content, user_id, sort_order, status]
            )
            connection.release()

            return result.insertId
        }
        catch (error) {
            console.error('创建文档失败:', error)
            throw error
        }
    }

    /**
     * 根据ID查找文档
     * @param {number} id 文档ID
     * @returns {Promise<Object|null>} 文档对象
     */
    static async findById(id) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(
                'SELECT * FROM documents WHERE id = ?',
                [id]
            )
            connection.release()

            return rows.length > 0 ? rows[0] : null
        }
        catch (error) {
            console.error(`根据ID查找文档失败 ${ id }:`, error)
            throw error
        }
    }

    /**
     * 根据书籍ID和slug查找文档
     * @param {number} bookId 书籍ID
     * @param {string} slug 文档slug
     * @returns {Promise<Object|null>} 文档对象
     */
    static async findByBookAndSlug(bookId, slug) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(
                'SELECT * FROM documents WHERE book_id = ? AND slug = ?',
                [bookId, slug]
            )
            connection.release()

            return rows.length > 0 ? rows[0] : null
        }
        catch (error) {
            console.error(`根据书籍ID和slug查找文档失败 ${ bookId }, ${ slug }:`, error)
            throw error
        }
    }

    /**
     * 根据书籍ID查找所有文档
     * @param {number} bookId 书籍ID
     * @returns {Promise<Array>} 文档数组
     */
    static async findAllByBookId(bookId) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(
                'SELECT * FROM documents WHERE book_id = ? ORDER BY sort_order ASC, created_at ASC',
                [bookId]
            )
            connection.release()

            return rows
        }
        catch (error) {
            console.error(`根据书籍ID查找文档失败 ${ bookId }:`, error)
            throw error
        }
    }

    /**
     * 根据父文档ID查找子文档
     * @param {number} parentId 父文档ID
     * @returns {Promise<Array>} 子文档数组
     */
    static async findByParentId(parentId) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(
                'SELECT * FROM documents WHERE parent_id = ? ORDER BY sort_order ASC, created_at ASC',
                [parentId]
            )
            connection.release()

            return rows
        }
        catch (error) {
            console.error(`根据父文档ID查找子文档失败 ${ parentId }:`, error)
            throw error
        }
    }

    /**
     * 获取书籍的文档树结构
     * @param {number} bookId 书籍ID
     * @returns {Promise<Array>} 树形结构的文档数组
     */
    static async getDocumentTree(bookId) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(
                'SELECT * FROM documents WHERE book_id = ? ORDER BY sort_order ASC, created_at ASC',
                [bookId]
            )
            connection.release()

            // 构建树形结构
            const buildTree = (documents, parentId = null) => {
                return documents
                    .filter(doc => doc.parent_id === parentId)
                    .map(doc => ({
                        ...doc,
                        children: buildTree(documents, doc.id)
                    }))
            }

            return buildTree(rows)
        }
        catch (error) {
            console.error(`获取文档树失败 ${ bookId }:`, error)
            throw error
        }
    }

    /**
     * 更新文档
     * @param {number} id 文档ID
     * @param {Object} docData 更新数据
     * @returns {Promise<boolean>} 是否成功
     */
    static async update(id, docData) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()

            const fields = []
            const values = []

            if (docData.title !== undefined) {
                fields.push('title = ?')
                values.push(docData.title)
            }
            if (docData.slug !== undefined) {
                fields.push('slug = ?')
                values.push(docData.slug)
            }
            if (docData.content !== undefined) {
                fields.push('content = ?')
                values.push(docData.content)
            }
            if (docData.parent_id !== undefined) {
                fields.push('parent_id = ?')
                values.push(docData.parent_id)
            }
            if (docData.sort_order !== undefined) {
                fields.push('sort_order = ?')
                values.push(docData.sort_order)
            }
            if (docData.status !== undefined) {
                fields.push('status = ?')
                values.push(docData.status)
            }

            if (fields.length === 0) {
                throw new Error('没有提供要更新的字段')
            }

            fields.push('updated_at = CURRENT_TIMESTAMP')
            values.push(id)

            const [result] = await connection.execute(
                `UPDATE documents
                 SET ${ fields.join(', ') }
                 WHERE id = ?`,
                values
            )
            connection.release()

            return result.affectedRows > 0
        }
        catch (error) {
            console.error(`更新文档失败 ${ id }:`, error)
            throw error
        }
    }

    /**
     * 删除文档
     * @param {number} id 文档ID
     * @returns {Promise<boolean>} 是否成功
     */
    static async delete(id) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [result] = await connection.execute(
                'DELETE FROM documents WHERE id = ?',
                [id]
            )
            connection.release()

            return result.affectedRows > 0
        }
        catch (error) {
            console.error(`删除文档失败 ${ id }:`, error)
            throw error
        }
    }

    /**
     * 检查文档slug在书籍中是否存在
     * @param {number} bookId 书籍ID
     * @param {string} slug 文档slug
     * @param {number} excludeId 排除的文档ID
     * @returns {Promise<boolean>} 是否存在
     */
    static async slugExists(bookId, slug, excludeId = null) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()

            let sql = 'SELECT COUNT(*) as count FROM documents WHERE book_id = ? AND slug = ?'
            let params = [bookId, slug]

            if (excludeId) {
                sql += ' AND id != ?'
                params.push(excludeId)
            }

            const [rows] = await connection.execute(sql, params)
            connection.release()

            return rows[0].count > 0
        }
        catch (error) {
            console.error(`检查文档slug是否存在失败 ${ bookId }, ${ slug }:`, error)
            throw error
        }
    }

    static async findAllByConditions(searchParams = {}) {
        try {
            const whereConditions = []
            const params = []

            if (searchParams.user_id) {
                whereConditions.push('d.user_id = ?')
                params.push(searchParams.user_id)
            }

            if (searchParams.book_id) {
                whereConditions.push('d.book_id = ?')
                params.push(searchParams.book_id)
            }

            if (searchParams.status) {
                whereConditions.push('d.status = ?')
                params.push(searchParams.status)
            }

            if (searchParams.parent_id !== undefined) {
                if (searchParams.parent_id === null) {
                    whereConditions.push('d.parent_id IS NULL')
                }
                else {
                    whereConditions.push('d.parent_id = ?')
                    params.push(searchParams.parent_id)
                }
            }

            const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''

            const pool = getPool()
            const [rows] = await pool.query(`
                SELECT d.*,
                       DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                       DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
                FROM documents d
                         LEFT JOIN users u ON d.user_id = u.id
                    ${ whereClause }
                ORDER BY sort_order ASC, created_at ASC`, params)

            return rows || []
        }
        catch (error) {
            throw error
        }
    }
}

module.exports = Document
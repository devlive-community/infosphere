const { getPool } = require('../tools/db')
const bcrypt = require('bcrypt')

class User {
    /**
     * 查找所有用户
     * @param {Object} options 查询选项 { limit, offset, orderBy, order }
     * @returns {Promise<Array>} 用户数组
     */
    static async findAll(options = {}) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()

            const { limit = null, offset = 0, orderBy = 'created_at', order = 'DESC' } = options

            let sql = `SELECT id,
                              username,
                              email,
                              role,
                              avatar,
                              created_at,
                              updated_at,
                              is_active
                       FROM users
                       ORDER BY ${ orderBy } ${ order }`

            if (limit) {
                sql += ` LIMIT ${ limit } OFFSET ${ offset }`
            }

            const [rows] = await connection.execute(sql)
            connection.release()

            return rows
        }
        catch (error) {
            console.error('查找所有用户失败:', error)
            throw error
        }
    }

    /**
     * 根据ID查找用户
     * @param {number} id 用户ID
     * @returns {Promise<Object|null>} 用户对象
     */
    static async findById(id) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(`
                  SELECT id,
                         username,
                         email,
                         role,
                         avatar,
                         created_at,
                         updated_at,
                         is_active,
                         DATE_FORMAT(last_login_at, '%Y-%m-%d %H:%i:%s') AS last_login_at
                  FROM users
                  WHERE id = ?
                `,
                [id]
            )
            connection.release()

            return rows.length > 0 ? rows[0] : null
        }
        catch (error) {
            console.error(`根据ID查找用户失败 ${ id }:`, error)
            throw error
        }
    }

    /**
     * 根据用户名查找用户
     * @param {string} username 用户名
     * @returns {Promise<Object|null>} 用户对象
     */
    static async findByUsername(username) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(
                'SELECT id, username, email, role, avatar, created_at, updated_at, is_active FROM users WHERE username = ?',
                [username]
            )
            connection.release()

            return rows.length > 0 ? rows[0] : null
        }
        catch (error) {
            console.error(`根据用户名查找用户失败 ${ username }:`, error)
            throw error
        }
    }

    /**
     * 根据邮箱查找用户
     * @param {string} email 邮箱
     * @returns {Promise<Object|null>} 用户对象
     */
    static async findByEmail(email) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(
                'SELECT id, username, email, role, avatar, created_at, updated_at, is_active FROM users WHERE email = ?',
                [email]
            )
            connection.release()

            return rows.length > 0 ? rows[0] : null
        }
        catch (error) {
            console.error(`根据邮箱查找用户失败 ${ email }:`, error)
            throw error
        }
    }

    /**
     * 根据角色查找用户
     * @param {string} role 用户角色 ('admin', 'user')
     * @returns {Promise<Array>} 用户数组
     */
    static async findByRole(role) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(
                'SELECT id, username, email, role, avatar, created_at, updated_at, is_active FROM users WHERE role = ?',
                [role]
            )
            connection.release()

            return rows
        }
        catch (error) {
            console.error(`根据角色查找用户失败 ${ role }:`, error)
            throw error
        }
    }

    /**
     * 根据状态查找用户
     * @param {boolean} isActive 是否激活
     * @returns {Promise<Array>} 用户数组
     */
    static async findByStatus(isActive) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(
                'SELECT id, username, email, role, avatar, created_at, updated_at, is_active FROM users WHERE is_active = ?',
                [isActive]
            )
            connection.release()

            return rows
        }
        catch (error) {
            console.error(`根据状态查找用户失败 ${ isActive }:`, error)
            throw error
        }
    }

    /**
     * 根据关键词搜索用户
     * @param {string} keyword 搜索关键词（用户名或邮箱）
     * @returns {Promise<Array>} 用户数组
     */
    static async findByKeyword(keyword) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(`
                SELECT id,
                       username,
                       email,
                       role,
                       avatar,
                       created_at,
                       updated_at,
                       is_active
                FROM users
                WHERE username LIKE ?
                   OR email LIKE ?
                ORDER BY username
            `, [`%${ keyword }%`, `%${ keyword }%`])
            connection.release()

            return rows
        }
        catch (error) {
            console.error('根据关键词搜索用户失败:', error)
            throw error
        }
    }

    /**
     * 用户登录验证（包含密码）
     * @param {string} usernameOrEmail 用户名或邮箱
     * @returns {Promise<Object|null>} 包含密码的用户对象
     */
    static async findForAuth(usernameOrEmail) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(`
                  SELECT *
                  FROM users
                  WHERE (username = ? OR email = ?)
                `,
                [usernameOrEmail, usernameOrEmail]
            )
            connection.release()

            return rows.length > 0 ? rows[0] : null
        }
        catch (error) {
            console.error(`查找认证用户失败 ${ usernameOrEmail }:`, error)
            throw error
        }
    }

    /**
     * 创建新用户
     * @param {Object} userData 用户数据
     * @returns {Promise<number>} 插入的用户ID
     */
    static async create(userData) {
        const { username, email, password, role = 'user', avatar = null } = userData

        try {
            const pool = getPool()
            const connection = await pool.getConnection()

            // 密码哈希
            const hashedPassword = await bcrypt.hash(password, 12)

            const [result] = await connection.execute(
                'INSERT INTO users (username, email, password, role, avatar) VALUES (?, ?, ?, ?, ?)',
                [username, email, hashedPassword, role, avatar]
            )
            connection.release()

            return result.insertId
        }
        catch (error) {
            console.error('创建用户失败:', error)
            throw error
        }
    }

    /**
     * 更新用户信息
     * @param {number} id 用户ID
     * @param {Object} userData 更新的用户数据
     * @returns {Promise<boolean>} 是否成功
     */
    static async update(id, userData) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()

            const fields = []
            const values = []

            // 动态构建更新字段
            if (userData.username !== undefined) {
                fields.push('username = ?')
                values.push(userData.username)
            }
            if (userData.email !== undefined) {
                fields.push('email = ?')
                values.push(userData.email)
            }
            if (userData.role !== undefined) {
                fields.push('role = ?')
                values.push(userData.role)
            }
            if (userData.avatar !== undefined) {
                fields.push('avatar = ?')
                values.push(userData.avatar)
            }
            if (userData.is_active !== undefined) {
                fields.push('is_active = ?')
                values.push(userData.is_active)
            }

            if (fields.length === 0) {
                throw new Error('没有提供要更新的字段')
            }

            fields.push('updated_at = CURRENT_TIMESTAMP')
            values.push(id)

            const [result] = await connection.execute(
                `UPDATE users
                 SET ${ fields.join(', ') }
                 WHERE id = ?`,
                values
            )
            connection.release()

            return result.affectedRows > 0
        }
        catch (error) {
            console.error(`更新用户失败 ${ id }:`, error)
            throw error
        }
    }

    /**
     * 更新用户密码
     * @param {number} id 用户ID
     * @param {string} newPassword 新密码
     * @returns {Promise<boolean>} 是否成功
     */
    static async updatePassword(id, newPassword) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()

            const hashedPassword = await bcrypt.hash(newPassword, 12)

            const [result] = await connection.execute(
                'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [hashedPassword, id]
            )
            connection.release()

            return result.affectedRows > 0
        }
        catch (error) {
            console.error(`更新用户密码失败 ${ id }:`, error)
            throw error
        }
    }

    /**
     * 根据ID更新用户
     * @param {number} id 用户ID
     * @param {Object} userData 更新的用户数据
     * @returns {Promise<boolean>} 是否成功更新
     */
    static async updateById(id, userData) {
        return await this.update(id, userData)
    }

    /**
     * 删除用户
     * @param {number} id 用户ID
     * @returns {Promise<boolean>} 是否成功删除
     */
    static async delete(id) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [result] = await connection.execute(
                'DELETE FROM users WHERE id = ?',
                [id]
            )
            connection.release()

            return result.affectedRows > 0
        }
        catch (error) {
            console.error(`删除用户失败 ${ id }:`, error)
            throw error
        }
    }

    /**
     * 根据ID删除用户
     * @param {number} id 用户ID
     * @returns {Promise<boolean>} 是否成功删除
     */
    static async deleteById(id) {
        return await this.delete(id)
    }

    /**
     * 批量删除用户
     * @param {number[]} ids 用户ID数组
     * @returns {Promise<number>} 删除的数量
     */
    static async deleteBatch(ids) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const placeholders = ids.map(() => '?').join(',')
            const [result] = await connection.execute(
                `DELETE
                 FROM users
                 WHERE id IN (${ placeholders })`,
                ids
            )
            connection.release()

            return result.affectedRows
        }
        catch (error) {
            console.error('批量删除用户失败:', error)
            throw error
        }
    }

    /**
     * 软删除用户（设置为非激活状态）
     * @param {number} id 用户ID
     * @returns {Promise<boolean>} 是否成功
     */
    static async softDelete(id) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [result] = await connection.execute(
                'UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [id]
            )
            connection.release()

            return result.affectedRows > 0
        }
        catch (error) {
            console.error(`软删除用户失败 ${ id }:`, error)
            throw error
        }
    }

    /**
     * 检查用户是否存在
     * @param {number} id 用户ID
     * @returns {Promise<boolean>} 是否存在
     */
    static async exists(id) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(
                'SELECT COUNT(*) as count FROM users WHERE id = ?',
                [id]
            )
            connection.release()

            return rows[0].count > 0
        }
        catch (error) {
            console.error(`检查用户是否存在失败 ${ id }:`, error)
            throw error
        }
    }

    /**
     * 检查用户名是否存在
     * @param {string} username 用户名
     * @param {number} excludeId 排除的用户ID（用于更新时检查）
     * @returns {Promise<boolean>} 是否存在
     */
    static async usernameExists(username, excludeId = null) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()

            let sql = 'SELECT COUNT(*) as count FROM users WHERE username = ?'
            let params = [username]

            if (excludeId) {
                sql += ' AND id != ?'
                params.push(excludeId)
            }

            const [rows] = await connection.execute(sql, params)
            connection.release()

            return rows[0].count > 0
        }
        catch (error) {
            console.error(`检查用户名是否存在失败 ${ username }:`, error)
            throw error
        }
    }

    /**
     * 检查邮箱是否存在
     * @param {string} email 邮箱
     * @param {number} excludeId 排除的用户ID（用于更新时检查）
     * @returns {Promise<boolean>} 是否存在
     */
    static async emailExists(email, excludeId = null) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()

            let sql = 'SELECT COUNT(*) as count FROM users WHERE email = ?'
            let params = [email]

            if (excludeId) {
                sql += ' AND id != ?'
                params.push(excludeId)
            }

            const [rows] = await connection.execute(sql, params)
            connection.release()

            return rows[0].count > 0
        }
        catch (error) {
            console.error(`检查邮箱是否存在失败 ${ email }:`, error)
            throw error
        }
    }

    /**
     * 验证密码
     * @param {string} plainPassword 明文密码
     * @param {string} hashedPassword 哈希密码
     * @returns {Promise<boolean>} 密码是否匹配
     */
    static async verifyPassword(plainPassword, hashedPassword) {
        try {
            return await bcrypt.compare(plainPassword, hashedPassword)
        }
        catch (error) {
            console.error('验证密码失败:', error)
            throw error
        }
    }

    static async updateLastLogin(id) {
        try {
            const pool = getPool()
            await pool.query(
                'UPDATE users SET last_login_at = NOW() WHERE id = ?',
                [id]
            )
        }
        catch (error) {
            console.error('更新最后登录时间错误:', error.message)
            throw error
        }
    }

    /**
     * 用户登录
     * @param {string} usernameOrEmail 用户名或邮箱
     * @param {string} password 密码
     * @returns {Promise<Object|null>} 登录成功返回用户信息，失败返回null
     */
    static async login(usernameOrEmail, password) {
        try {
            if (!usernameOrEmail || !password) {
                throw new Error('请输入用户名和密码!')
            }

            // 查找用户
            const user = await this.findForAuth(usernameOrEmail)

            if (!user) {
                throw new Error('无效的账户信息！')
            }

            // 验证密码
            const isValidPassword = await this.verifyPassword(password, user.password)

            if (!isValidPassword) {
                throw new Error('用户密码错误！')
            }

            if (user.is_active === 0) {
                throw new Error('账户已被禁用，请联系管理员!')
            }

            await this.updateLastLogin(user.id)

            const { password: _, ...userInfo } = user
            return userInfo
        }
        catch (error) {
            console.error(`用户登录失败 ${ usernameOrEmail }:`, error)
            throw error
        }
    }

    static async findByProvider(provider, providerId) {
        try {
            const pool = getPool()
            const [rows] = await pool.query(
                `SELECT u.*, ua.provider, ua.provider_id, ua.provider_username, ua.is_primary
                 FROM users u
                          INNER JOIN user_authentications ua ON u.id = ua.user_id
                 WHERE ua.provider = ?
                   AND ua.provider_id = ?`,
                [provider, providerId.toString()]
            )
            return rows[0] || null
        }
        catch (error) {
            console.error('Query user by provider error:', error.message)
            throw error
        }
    }

    static async createWithAuth(userData, authData) {
        const pool = getPool()
        const connection = await pool.getConnection()
        try {
            await connection.beginTransaction()

            const {
                username,
                email,
                avatar
            } = userData

            const [userResult] = await connection.query(
                'INSERT INTO users (username, email, avatar, last_login_at) VALUES (?, ?, ?, NOW())',
                [username, email, avatar]
            )

            const userId = userResult.insertId

            const {
                provider,
                provider_id,
                provider_username,
                provider_email,
                access_token,
                refresh_token,
                token_expires_at
            } = authData

            await connection.query(
                `INSERT INTO user_authentications
                 (user_id, provider, provider_id, provider_username, provider_email, access_token, refresh_token, token_expires_at, is_primary)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
                [userId, provider, provider_id.toString(), provider_username, provider_email, access_token, refresh_token, token_expires_at]
            )

            await connection.commit()
            return this.findById(userId)
        }
        catch (error) {
            await connection.rollback()
            console.error('Create user with auth error:', error.message)
            throw error
        }
        finally {
            connection.release()
        }
    }

    static async addAuthentication(userId, authData) {
        try {
            const {
                provider,
                provider_id,
                provider_username,
                provider_email,
                access_token,
                refresh_token,
                token_expires_at
            } = authData

            const pool = getPool()

            const [existing] = await pool.query(
                'SELECT id FROM user_authentications WHERE user_id = ? AND provider = ?',
                [userId, provider]
            )

            if (existing.length > 0) {
                throw new Error(`${ provider } 帐户已链接到此用户`)
            }

            const [conflictRows] = await pool.query(
                'SELECT user_id FROM user_authentications WHERE provider = ? AND provider_id = ?',
                [provider, provider_id.toString()]
            )

            if (conflictRows.length > 0) {
                throw new Error(`${ provider } 帐户已链接到其他用户`)
            }

            await pool.query(
                `INSERT INTO user_authentications
                 (user_id, provider, provider_id, provider_username, provider_email, access_token, refresh_token, token_expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, provider, provider_id.toString(), provider_username, provider_email, access_token, refresh_token, token_expires_at]
            )

            return this.findById(userId)
        }
        catch (error) {
            console.error('Add authentication error:', error)
            throw error
        }
    }

    static async updateAuthTokens(userId, provider, tokens) {
        try {
            const { access_token, refresh_token, token_expires_at } = tokens
            const pool = getPool()

            await pool.query(
                `UPDATE user_authentications
                 SET access_token     = ?,
                     refresh_token    = ?,
                     token_expires_at = ?,
                     updated_at       = NOW()
                 WHERE user_id = ?
                   AND provider = ?`,
                [access_token, refresh_token, token_expires_at, userId, provider]
            )
        }
        catch (error) {
            console.error('Update auth tokens error:', error.message)
            throw error
        }
    }

    static async removeAuthentication(userId, provider) {
        try {
            const pool = getPool()

            await pool.query(
                'DELETE FROM user_authentications WHERE user_id = ? AND provider = ?',
                [userId, provider]
            )

            return this.findById(userId)
        }
        catch (error) {
            console.error('Remove authentication error:', error.message)
            throw error
        }
    }

    static async getAuthentications(userId) {
        try {
            const pool = getPool()
            const [rows] = await pool.query(
                'SELECT provider, provider_username, provider_email, is_primary, created_at FROM user_authentications WHERE user_id = ? ORDER BY is_primary DESC, created_at ASC',
                [userId]
            )
            return rows
        }
        catch (error) {
            console.error('Get authentications error:', error.message)
            throw error
        }
    }

}

module.exports = User
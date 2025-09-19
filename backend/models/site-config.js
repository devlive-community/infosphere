const { getPool } = require('../tools/db')

class SiteConfig {
    /**
     * 查找所有配置
     * @returns {Promise<Object>} 配置对象，键值对形式
     */
    static async findAll() {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(
                'SELECT config_key, config_value FROM site_configs'
            )
            connection.release()

            // 转换为键值对对象
            const configs = {}
            rows.forEach(row => {
                configs[row.config_key] = row.config_value
            })

            return configs
        }
        catch (error) {
            console.error('查找所有站点配置失败:', error)
            throw error
        }
    }

    /**
     * 根据key查找单个配置
     * @param {string} key 配置键
     * @returns {Promise<string|null>} 配置值
     */
    static async findByKey(key) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(
                'SELECT config_value FROM site_configs WHERE config_key = ?',
                [key]
            )
            connection.release()

            return rows.length > 0 ? rows[0].config_value : null
        }
        catch (error) {
            console.error(`根据key查找配置失败 ${ key }:`, error)
            throw error
        }
    }

    /**
     * 批量根据keys查找多个配置
     * @param {string[]} keys 配置键数组
     * @returns {Promise<Object>} 配置对象
     */
    static async findByKeys(keys) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const placeholders = keys.map(() => '?').join(',')
            const [rows] = await connection.execute(
                `SELECT config_key, config_value
                 FROM site_configs
                 WHERE config_key IN (${ placeholders })`,
                keys
            )
            connection.release()

            const configs = {}
            rows.forEach(row => {
                configs[row.config_key] = row.config_value
            })

            return configs
        }
        catch (error) {
            console.error('批量根据keys查找配置失败:', error)
            throw error
        }
    }

    /**
     * 根据关键词搜索配置
     * @param {string} keyword 搜索关键词
     * @returns {Promise<Array>} 匹配的配置数组
     */
    static async findByKeyword(keyword) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(`
                SELECT *
                FROM site_configs
                WHERE config_key LIKE ?
                   OR description LIKE ?
                ORDER BY config_key
            `, [`%${ keyword }%`, `%${ keyword }%`])
            connection.release()

            return rows
        }
        catch (error) {
            console.error('根据关键词搜索配置失败:', error)
            throw error
        }
    }

    /**
     * 查找配置详情（包含描述、创建时间等）
     * @param {string} key 配置键
     * @returns {Promise<Object|null>} 配置详情对象
     */
    static async findDetailByKey(key) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(
                'SELECT * FROM site_configs WHERE config_key = ?',
                [key]
            )
            connection.release()

            return rows.length > 0 ? rows[0] : null
        }
        catch (error) {
            console.error(`根据key查找配置详情失败 ${ key }:`, error)
            throw error
        }
    }

    /**
     * 查找所有配置详情
     * @returns {Promise<Array>} 配置详情数组
     */
    static async findAllDetails() {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(
                'SELECT * FROM site_configs ORDER BY config_key'
            )
            connection.release()

            return rows
        }
        catch (error) {
            console.error('查找所有配置详情失败:', error)
            throw error
        }
    }

    /**
     * 更新单个配置
     * @param {string} key 配置键
     * @param {string} value 配置值
     * @param {string} description 配置描述（可选）
     * @returns {Promise<boolean>} 是否成功
     */
    static async update(key, value, description = null) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()

            if (description) {
                await connection.execute(`
                    INSERT INTO site_configs (config_key, config_value, description)
                    VALUES (?, ?, ?) ON DUPLICATE KEY
                    UPDATE
                        config_value =
                    VALUES (config_value), description =
                    VALUES (description), updated_at = CURRENT_TIMESTAMP
                `, [key, value, description])
            }
            else {
                await connection.execute(`
                    INSERT INTO site_configs (config_key, config_value)
                    VALUES (?, ?) ON DUPLICATE KEY
                    UPDATE
                        config_value =
                    VALUES (config_value), updated_at = CURRENT_TIMESTAMP
                `, [key, value])
            }

            connection.release()
            return true
        }
        catch (error) {
            console.error(`更新配置失败 ${ key }:`, error)
            throw error
        }
    }

    /**
     * 批量更新多个配置
     * @param {Object} configs 配置对象，键值对形式
     * @returns {Promise<boolean>} 是否成功
     */
    static async updateBatch(configs) {
        const pool = getPool()
        const connection = await pool.getConnection()

        try {
            await connection.beginTransaction()

            for (const [key, value] of Object.entries(configs)) {
                await connection.execute(`
                    INSERT INTO site_configs (config_key, config_value)
                    VALUES (?, ?) ON DUPLICATE KEY
                    UPDATE
                        config_value =
                    VALUES (config_value), updated_at = CURRENT_TIMESTAMP
                `, [key, value])
            }

            await connection.commit()
            return true
        }
        catch (error) {
            await connection.rollback()
            console.error('批量更新配置失败:', error)
            throw error
        }
        finally {
            connection.release()
        }
    }

    /**
     * 根据key更新配置
     * @param {string} key 配置键
     * @param {string} value 新的配置值
     * @returns {Promise<boolean>} 是否成功更新
     */
    static async updateByKey(key, value) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [result] = await connection.execute(
                'UPDATE site_configs SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE config_key = ?',
                [value, key]
            )
            connection.release()

            return result.affectedRows > 0
        }
        catch (error) {
            console.error(`根据key更新配置失败 ${ key }:`, error)
            throw error
        }
    }

    /**
     * 删除配置
     * @param {string} key 配置键
     * @returns {Promise<boolean>} 是否成功删除
     */
    static async delete(key) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [result] = await connection.execute(
                'DELETE FROM site_configs WHERE config_key = ?',
                [key]
            )
            connection.release()

            return result.affectedRows > 0
        }
        catch (error) {
            console.error(`删除配置失败 ${ key }:`, error)
            throw error
        }
    }

    /**
     * 根据key删除配置
     * @param {string} key 配置键
     * @returns {Promise<boolean>} 是否成功删除
     */
    static async deleteByKey(key) {
        return await this.delete(key)
    }

    /**
     * 批量删除配置
     * @param {string[]} keys 配置键数组
     * @returns {Promise<number>} 删除的数量
     */
    static async deleteBatch(keys) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const placeholders = keys.map(() => '?').join(',')
            const [result] = await connection.execute(
                `DELETE
                 FROM site_configs
                 WHERE config_key IN (${ placeholders })`,
                keys
            )
            connection.release()

            return result.affectedRows
        }
        catch (error) {
            console.error('批量删除配置失败:', error)
            throw error
        }
    }

    /**
     * 检查配置是否存在
     * @param {string} key 配置键
     * @returns {Promise<boolean>} 是否存在
     */
    static async exists(key) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [rows] = await connection.execute(
                'SELECT COUNT(*) as count FROM site_configs WHERE config_key = ?',
                [key]
            )
            connection.release()

            return rows[0].count > 0
        }
        catch (error) {
            console.error(`检查配置是否存在失败 ${ key }:`, error)
            throw error
        }
    }

    /**
     * 创建新配置
     * @param {string} key 配置键
     * @param {string} value 配置值
     * @param {string} description 配置描述
     * @returns {Promise<number>} 插入的ID
     */
    static async create(key, value, description = null) {
        try {
            const pool = getPool()
            const connection = await pool.getConnection()
            const [result] = await connection.execute(
                'INSERT INTO site_configs (config_key, config_value, description) VALUES (?, ?, ?)',
                [key, value, description]
            )
            connection.release()

            return result.insertId
        }
        catch (error) {
            console.error('创建配置失败:', error)
            throw error
        }
    }
}

module.exports = SiteConfig
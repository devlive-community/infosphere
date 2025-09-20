/**
 * Universal Pagination Utility Class
 */
class PaginationHelper {
    /**
     * Parse pagination parameters
     * @param {Object} query - Request query parameters
     * @param {Object} options - Pagination options
     * @returns {Object} Pagination parameters
     */
    static parseParams(query, options = {}) {
        const defaultOptions = {
            defaultPage: 1,
            defaultLimit: 10,
            maxLimit: 100,
            allowedLimits: [5, 10, 20, 50, 100]
        }

        const config = { ...defaultOptions, ...options }

        let page = parseInt(query.page) || config.defaultPage
        let limit = parseInt(query.limit) || config.defaultLimit

        // Validate parameters
        page = Math.max(1, page)
        limit = Math.max(1, Math.min(limit, config.maxLimit))

        // If allowed limits list is provided, ensure limit is in the list
        if (config.allowedLimits && !config.allowedLimits.includes(limit)) {
            limit = config.defaultLimit
        }

        const offset = (page - 1) * limit

        return {
            page,
            limit,
            offset
        }
    }

    /**
     * Calculate pagination information
     * @param {Number} totalItems - Total number of records
     * @param {Object} params - Pagination parameters {page, limit}
     * @param {Object} options - Other options
     * @returns {Object} Complete pagination information
     */
    static calculatePagination(totalItems, params, options = {}) {
        const { page, limit } = params
        const totalPages = Math.ceil(totalItems / limit)

        return {
            currentPage: page,
            totalPages,
            totalItems,
            pageSize: limit,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            nextPage: page < totalPages ? page + 1 : null,
            prevPage: page > 1 ? page - 1 : null,
            startIndex: (page - 1) * limit + 1,
            endIndex: Math.min(page * limit, totalItems),
            maxVisiblePages: 4,
            ...options
        }
    }

    /**
     * Build SQL paginated query
     * @param {String} baseQuery - Base query statement (without LIMIT)
     * @param {String} countQuery - Count query statement
     * @param {Array} params - Query parameters
     * @param {Object} paginationParams - Pagination parameters
     * @returns {Object} Query results and pagination information
     */
    static async executePaginatedQuery(pool, baseQuery, countQuery, params, paginationParams) {
        try {
            // Execute count query
            const [countResult] = await pool.query(countQuery, params)
            const totalItems = countResult[0].total || 0

            // Return early if no data
            if (totalItems === 0) {
                return {
                    data: [],
                    pagination: this.calculatePagination(0, paginationParams)
                }
            }

            // Execute paginated query
            const paginatedQuery = `${ baseQuery } LIMIT ${ paginationParams.limit } OFFSET ${ paginationParams.offset }`
            const [dataResult] = await pool.query(paginatedQuery, params)

            // Calculate pagination information
            const pagination = this.calculatePagination(totalItems, paginationParams)

            return {
                data: dataResult,
                pagination
            }
        }
        catch (error) {
            console.error('Pagination query error:', error)
            throw error
        }
    }
}

module.exports = PaginationHelper
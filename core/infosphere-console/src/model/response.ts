export interface Response
{
    code?: number
    status?: boolean
    message?: string
    data?: any
}

export interface Pagination
{
    page?: number
    size?: number
    total?: number
    totalPage?: number
    visibility?: boolean
    excludeUser?: boolean
}

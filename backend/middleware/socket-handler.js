const marked = require('../lib/extension/marked/marked')

// 存储房间中的用户信息
const roomUsers = new Map() // roomId -> Map of users (userId -> userInfo)

/**
 * 初始化 Socket.IO 事件处理
 * @param {SocketIO.Server} io - Socket.IO 服务器实例
 */
function initializeSocketHandlers(io) {
    io.on('connection', (socket) => {
        console.log('用户连接', socket.id)

        // 用户认证
        socket.on('authenticate', (userData) => {
            socket.userId = userData.id
            socket.username = userData.username
            socket.avatar = userData.avatar || null
            console.log(`用户 ${ userData.username } (${ socket.id }) 已认证`)
        })

        // 加入书籍房间
        socket.on('join-book-room', (data) => {
            const roomId = `book-${ data.slug }-room`
            socket.join(roomId)
            socket.currentBookRoom = roomId

            // 确保用户已认证
            if (!socket.userId || !socket.username) {
                console.log('用户未认证，无法加入书籍房间')
                return
            }

            // 添加用户到书籍房间用户列表
            if (!roomUsers.has(roomId)) {
                roomUsers.set(roomId, new Map())
            }

            const users = roomUsers.get(roomId)
            users.set(socket.userId, {
                id: socket.userId,
                username: socket.username,
                avatar: socket.avatar,
                socketId: socket.id,
                joinedAt: new Date(),
                type: 'book' // 标识这是在书籍房间
            })

            console.log(`用户 ${ socket.username } 加入 [${ data.name }] 书籍房间`)

            // 获取当前书籍房间所有用户
            const currentUsers = Array.from(users.values())

            // 向房间内所有用户（包括自己）发送更新的用户列表
            io.to(roomId).emit('book-room-users-updated', {
                bookSlug: data.slug,
                users: currentUsers
            })

            // 向其他用户广播新用户加入书籍
            socket.to(roomId).emit('user-joined-book', {
                user: {
                    id: socket.userId,
                    username: socket.username,
                    avatar: socket.avatar
                },
                bookSlug: data.slug
            })
        })

        // 加入文档房间
        socket.on('join-document-room', (data) => {
            const roomId = `doc-${ data.slug }-room`
            socket.join(roomId)
            socket.currentDocRoom = roomId

            // 确保用户已认证
            if (!socket.userId || !socket.username) {
                console.log('用户未认证，无法加入文档房间')
                return
            }

            // 添加用户到文档房间用户列表
            if (!roomUsers.has(roomId)) {
                roomUsers.set(roomId, new Map())
            }

            const users = roomUsers.get(roomId)

            // 更新用户信息，标记为正在编辑文档
            const userInfo = {
                id: socket.userId,
                username: socket.username,
                avatar: socket.avatar,
                socketId: socket.id,
                joinedAt: new Date(),
                type: 'document', // 标识这是在文档房间
                documentSlug: data.slug
            }

            users.set(socket.userId, userInfo)

            console.log(`用户 ${ socket.username } 加入 [${ data.name }] 文档房间`)

            // 获取当前文档房间所有用户
            const currentUsers = Array.from(users.values())

            // 向房间内所有用户（包括自己）发送更新的用户列表
            io.to(roomId).emit('doc-room-users-updated', {
                documentSlug: data.slug,
                users: currentUsers
            })

            // 向其他用户广播新用户加入文档编辑
            socket.to(roomId).emit('user-joined-document', {
                user: {
                    id: socket.userId,
                    username: socket.username,
                    avatar: socket.avatar
                },
                documentSlug: data.slug
            })

            // 同时更新书籍房间中的用户状态（如果用户也在书籍房间中）
            if (socket.currentBookRoom) {
                const bookUsers = roomUsers.get(socket.currentBookRoom)
                if (bookUsers && bookUsers.has(socket.userId)) {
                    // 更新用户状态为正在编辑文档
                    const bookUserInfo = bookUsers.get(socket.userId)
                    bookUserInfo.editingDocument = data.slug
                    bookUserInfo.editingDocumentName = data.name

                    const bookCurrentUsers = Array.from(bookUsers.values())
                    io.to(socket.currentBookRoom).emit('book-room-users-updated', {
                        users: bookCurrentUsers
                    })
                }
            }
        })

        // 内容变化
        socket.on('document-change', (data) => {
            socket.to(`doc-${ data.documentSlug }-room`).emit('document-change', data)

            // 如果需要预览，渲染并返回
            if (data.needPreview) {
                const html = `<link href="https://cdnjs.cloudflare.com/ajax/libs/prism-themes/1.9.0/prism-ghcolors.css" rel="stylesheet"/><script src='https://cdn.tailwindcss.com'></script>` + marked.parse(data.content || '')
                socket.emit('document-preview-updated', {
                    documentSlug: data.documentSlug,
                    html: html
                })
            }
        })

        // 用户断开连接
        socket.on('disconnect', () => {
            console.log('用户断开连接', socket.id)

            // 从所有房间中移除用户
            const roomsToClean = []

            if (socket.currentBookRoom && socket.userId) {
                roomsToClean.push(socket.currentBookRoom)
            }

            if (socket.currentDocRoom && socket.userId) {
                roomsToClean.push(socket.currentDocRoom)
            }

            roomsToClean.forEach(roomId => {
                const users = roomUsers.get(roomId)

                if (users && users.has(socket.userId)) {
                    const user = users.get(socket.userId)
                    users.delete(socket.userId)

                    // 如果房间没有用户了，删除房间记录
                    if (users.size === 0) {
                        roomUsers.delete(roomId)
                    }
                    else {
                        // 通知其他用户有人离开
                        const remainingUsers = Array.from(users.values())

                        if (roomId.includes('book-')) {
                            io.to(roomId).emit('book-room-users-updated', {
                                users: remainingUsers
                            })
                            socket.to(roomId).emit('user-left-book', {
                                user: user
                            })
                        }
                        else if (roomId.includes('doc-')) {
                            io.to(roomId).emit('doc-room-users-updated', {
                                users: remainingUsers
                            })
                            socket.to(roomId).emit('user-left-document', {
                                user: user
                            })
                        }
                    }
                }
            })
        })
    })
}

/**
 * 获取房间用户列表
 * @param {string} roomId - 房间ID
 * @returns {Array} 用户列表
 */
function getRoomUsers(roomId) {
    const users = roomUsers.get(roomId)
    return users ? Array.from(users.values()) : []
}

/**
 * 获取所有房间信息
 * @returns {Object} 房间信息统计
 */
function getRoomsInfo() {
    const roomsInfo = {}
    roomUsers.forEach((users, roomId) => {
        roomsInfo[roomId] = {
            userCount: users.size,
            users: Array.from(users.values()).map(user => ({
                id: user.id,
                username: user.username,
                type: user.type,
                joinedAt: user.joinedAt
            }))
        }
    })
    return roomsInfo
}

module.exports = {
    initializeSocketHandlers,
    getRoomUsers,
    getRoomsInfo
}
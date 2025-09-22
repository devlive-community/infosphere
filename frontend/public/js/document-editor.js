document.addEventListener('DOMContentLoaded', function () {
    const socket = io()

    // DOM 元素
    const editor = document.getElementById('markdownEditor')
    const togglePreviewBtn = document.getElementById('togglePreview')
    const editorPane = document.getElementById('editorPane')
    const previewPane = document.getElementById('previewPane')
    const saveStatus = document.getElementById('saveStatus')
    const saveData = document.getElementById('saveData')
    const onlineUsers = document.getElementById('onlineUsers')

    let hasUnsavedChanges = false

    // 从全局变量获取数据
    const bookData = window.bookData || {}
    const documentData = window.documentData || {}
    const isEdit = window.isEdit || false
    const currentUser = window.currentUser || {} // 当前登录用户信息

    // 首先进行用户认证
    socket.emit('authenticate', {
        id: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar
    })

    // 加入书籍房间
    socket.emit('join-book-room', { slug: bookData.slug, name: bookData.title })

    if (isEdit) {
        socket.emit('join-document-room', {
            bookSlug: bookData.slug,
            slug: documentData.slug,
            name: documentData.title
        })
    }

    // 统一模态框处理函数
    function openDocumentModal(mode, docData = null) {
        const form = document.querySelector('#documentModal form')
        const modalTitle = document.getElementById('modalTitle')
        const submitBtn = document.getElementById('submitBtn')

        if (mode === 'new') {
            // 新建模式 - 清空表单
            modalTitle.textContent = '新建文档'
            submitBtn.textContent = '创建'
            form.action = `/document/${ bookData.username }/${ bookData.slug }`
            form.querySelector('#title').value = ''
            form.querySelector('#doc_slug').value = ''

            // 重置状态选择
            const statusInputs = form.querySelectorAll('input[name="status"]')
            statusInputs.forEach(input => {
                input.checked = input.value === 'published'
            })

            // 移除PUT方法
            const methodInput = form.querySelector('input[name="_method"]')
            if (methodInput) {
                methodInput.remove()
            }

            if (docData && docData.parentId) {
                let parentIdInput = form.querySelector('input[name="parent_id"]')
                if (!parentIdInput) {
                    parentIdInput = document.createElement('input')
                    parentIdInput.type = 'hidden'
                    parentIdInput.name = 'parent_id'
                    form.appendChild(parentIdInput)
                }
                parentIdInput.value = docData.parentId
            }
            else {
                const parentIdInput = form.querySelector('input[name="parent_id"]')
                if (parentIdInput) {
                    parentIdInput.remove()
                }
            }

        }
        else if (mode === 'edit' && docData) {
            // 编辑模式 - 填充数据
            modalTitle.textContent = '编辑文档'
            submitBtn.textContent = '保存'
            form.action = `/document/${ bookData.username }/${ bookData.slug }/${ docData.slug }`
            form.querySelector('#title').value = docData.title
            form.querySelector('#doc_slug').value = docData.slug

            // 添加PUT方法
            let methodInput = form.querySelector('input[name="_method"]')
            if (!methodInput) {
                methodInput = document.createElement('input')
                methodInput.type = 'hidden'
                methodInput.name = '_method'
                methodInput.value = 'PUT'
                form.appendChild(methodInput)
            }

            const parentIdInput = form.querySelector('input[name="parent_id"]')
            if (parentIdInput) {
                parentIdInput.remove()
            }
        }

        showModal('documentModal')
    }

    // 新建按钮事件
    const topAddBtn = document.getElementById('topAddBtn')
    if (topAddBtn) {
        topAddBtn.addEventListener('click', function () {
            openDocumentModal('new')
        })
    }

    const centerAddBtn = document.getElementById('centerAddBtn')
    if (centerAddBtn) {
        centerAddBtn.addEventListener('click', function () {
            openDocumentModal('new')
        })
    }

    // 初始化编辑器
    function initEditor() {
        if (!editor) {
            return
        }

        function handleContentChange() {
            hasUnsavedChanges = true
            updateSaveStatus('已修改未保存', 'text-orange-600')

            if (isEdit) {
                socket.emit('document-change', {
                    documentSlug: documentData.slug,
                    content: editor.value,
                    needPreview: !previewPane.classList.contains('hidden')
                })
            }
        }

        if (editor) {
            editor.addEventListener('input', handleContentChange)
        }
    }

    // 切换预览
    function togglePreview() {
        const isPreviewVisible = !previewPane.classList.contains('hidden')

        if (isPreviewVisible) {
            previewPane.classList.add('hidden')
            editorPane.classList.remove('w-1/2')
            editorPane.classList.add('w-full')
            togglePreviewBtn.innerHTML = '<i class="fas fa-eye"></i><span>预览</span>'
        }
        else {
            previewPane.classList.remove('hidden')
            editorPane.classList.remove('w-full')
            editorPane.classList.add('w-1/2')
            togglePreviewBtn.innerHTML = '<i class="fas fa-eye-slash"></i><span>隐藏预览</span>'

            if (isEdit) {
                socket.emit('document-change', {
                    documentSlug: documentData.slug,
                    content: editor.value,
                    needPreview: true
                })
            }
        }
    }

    // 更新保存状态
    function updateSaveStatus(text, className) {
        if (!saveStatus) {
            return
        }
        const statusEl = saveStatus.querySelector('span')
        const iconEl = saveStatus.querySelector('i')

        if (statusEl) {
            statusEl.textContent = text
        }
        if (iconEl) {
            iconEl.className = `fas fa-circle ${ className }`
        }
    }

    // 保存文档
    function saveDocument() {
        updateSaveStatus('保存中...', 'text-blue-600')

        const form = document.createElement('form')
        form.method = 'POST'
        form.action = `/document/${ bookData.username }/${ bookData.slug }/${ documentData.slug }`

        const contentInput = document.createElement('input')
        contentInput.type = 'hidden'
        contentInput.name = 'content'
        contentInput.value = editor.value
        form.appendChild(contentInput)

        const methodInput = document.createElement('input')
        methodInput.type = 'hidden'
        methodInput.name = '_method'
        methodInput.value = 'PUT'
        form.appendChild(methodInput)

        document.body.appendChild(form)
        form.submit()
    }

    if (togglePreviewBtn) {
        togglePreviewBtn.addEventListener('click', togglePreview)
    }

    if (saveData) {
        saveData.addEventListener('click', function (e) {
            e.preventDefault()
            saveDocument()
        })
    }

    // 标题自动生成 slug
    const titleInput = document.getElementById('title')
    if (titleInput) {
        titleInput.addEventListener('input', function () {
            const title = this.value.trim()
            const slug = title.toLowerCase()
                .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '')

            const slugInput = document.getElementById('doc_slug')
            if (slugInput) {
                slugInput.value = slug
            }
        })
    }

    // 更新在线用户显示
    function updateOnlineUsers(users, type = 'book') {
        if (!onlineUsers) {
            return
        }

        onlineUsers.innerHTML = ''

        if (users.length === 0) {
            onlineUsers.innerHTML = '<div class="text-gray-400 text-sm">无在线用户</div>'
            return
        }

        const userList = document.createElement('div')
        userList.className = 'flex items-center space-x-1'

        users.forEach(user => {
            const userElement = document.createElement('div')

            // 根据用户状态确定样式
            const isCurrentUser = user.id === currentUser.id
            let userClass, statusIcon, statusText

            if (type === 'document' || user.editingDocument) {
                // 正在编辑文档
                userClass = isCurrentUser ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                statusIcon = 'fa-edit'
                statusText = user.editingDocumentName ? `编辑: ${ user.editingDocumentName }` : '编辑中'
            }
            else {
                // 只是在浏览书籍
                userClass = isCurrentUser ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                statusIcon = 'fa-eye'
                statusText = '浏览中'
            }

            userElement.className = `group relative flex items-center space-x-1 ${ userClass } px-2 py-1 rounded-full text-xs cursor-pointer`
            userElement.title = `${ user.username } - ${ statusText }`

            userElement.innerHTML = `
                ${ user.avatar ?
                `<img src="${ user.avatar }" alt="${ user.username }" class="w-5 h-5 rounded-full">` :
                `<div class="w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs">${ user.username.charAt(0).toUpperCase() }</div>`
            }
                <span class="max-w-20 truncate">${ user.username }${ isCurrentUser ? ' (我)' : '' }</span>
                <i class="fas ${ statusIcon } text-xs opacity-75"></i>
            `

            userList.appendChild(userElement)
        })

        onlineUsers.appendChild(userList)
    }

    // 显示通知的辅助函数
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div')
        notification.className = `fixed top-4 right-4 p-3 rounded-lg shadow-lg z-50 transition-all duration-300 transform translate-x-full`

        const bgClass = type === 'info' ? 'bg-blue-500 text-white' : 'bg-gray-500 text-white'
        notification.className += ` ${ bgClass }`
        notification.textContent = message

        document.body.appendChild(notification)

        setTimeout(() => {
            notification.classList.remove('translate-x-full')
        }, 100)

        setTimeout(() => {
            notification.classList.add('translate-x-full')
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification)
                }
            }, 300)
        }, 3000)
    }

    // 书籍房间用户更新
    socket.on('book-room-users-updated', function (data) {
        console.log('书籍房间用户列表更新:', data.users)
        if (!isEdit) {
            // 如果不在编辑模式，显示书籍房间用户
            updateOnlineUsers(data.users, 'book')
        }
    })

    // 文档房间用户更新
    socket.on('doc-room-users-updated', function (data) {
        console.log('文档房间用户列表更新:', data.users)
        if (isEdit && data.documentSlug === documentData.slug) {
            // 如果在编辑模式，显示文档房间用户
            updateOnlineUsers(data.users, 'document')
        }
    })

    // 用户加入书籍
    socket.on('user-joined-book', function (data) {
        console.log(`用户 ${ data.user.username } 加入了书籍`)
        if (!isEdit) {
            showNotification(`${ data.user.username } 进入了书籍`, 'info')
        }
    })

    // 用户离开书籍
    socket.on('user-left-book', function (data) {
        console.log(`用户 ${ data.user.username } 离开了书籍`)
        if (!isEdit) {
            showNotification(`${ data.user.username } 离开了书籍`, 'info')
        }
    })

    // 用户加入文档编辑
    socket.on('user-joined-document', function (data) {
        console.log(`用户 ${ data.user.username } 加入了文档编辑`)
        if (isEdit) {
            showNotification(`${ data.user.username } 加入了编辑`, 'info')
        }
    })

    // 用户离开文档编辑
    socket.on('user-left-document', function (data) {
        console.log(`用户 ${ data.user.username } 离开了文档编辑`)
        if (isEdit) {
            showNotification(`${ data.user.username } 离开了编辑`, 'info')
        }
    })

    socket.on('document-updated', function (data) {
        if (data.documentSlug === documentData.slug) {
            updateSaveStatus('文档已被其他用户更新', 'text-blue-600')
        }
    })

    socket.on('document-preview-updated', function (data) {
        if (data.documentSlug === documentData.slug) {
            const previewIframe = document.getElementById('markdownPreview')
            if (previewIframe) {
                previewIframe.srcdoc = data.html
            }
        }
    })

    socket.on('document-deleted', function (data) {
        console.log(`文档 ${ data.documentSlug } 已被删除`)
    })

    if (!isEdit) {
        window.addEventListener('beforeunload', function (e) {
            if (hasUnsavedChanges) {
                e.preventDefault()
                e.returnValue = '您有未保存的更改，确定要离开吗？'
            }
        })
    }

    // 快捷键支持
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault()
            if (saveData && hasUnsavedChanges) {
                saveData.click()
            }
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault()
            if (togglePreviewBtn) {
                togglePreview()
            }
        }
    })

    // 初始化
    initEditor()

    if (isEdit) {
        socket.emit('document-change', {
            documentSlug: documentData.slug,
            content: editor.value,
            needPreview: false
        })
    }

    // 暴露函数到全局作用域，供模态框使用
    window.openDocumentModal = openDocumentModal
})
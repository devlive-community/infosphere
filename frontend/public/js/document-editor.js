document.addEventListener('DOMContentLoaded', function () {
    const socket = io()

    // DOM 元素
    const editor = document.getElementById('markdownEditor')
    const togglePreviewBtn = document.getElementById('togglePreview')
    const editorPane = document.getElementById('editorPane')
    const previewPane = document.getElementById('previewPane')
    const saveStatus = document.getElementById('saveStatus')
    const saveData = document.getElementById('saveData')

    let hasUnsavedChanges = false

    // 从全局变量获取数据
    const bookData = window.bookData || {}
    const documentData = window.documentData || {}
    const isEdit = window.isEdit || false

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

    // Socket.IO 事件监听
    socket.on('user-joined', function (data) {
        console.log(`用户 ${ data.username } 加入了编辑`)
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
function EditorEntity(id, markdown, tocContainer, mode, config, toolbarIcons) {
    this.id = id; // 编辑器ID
    this.markdown = markdown; // 编辑器内容
    this.tocContainer = tocContainer; // 编辑器内容菜单
    this.mode = mode;
    this.toolbarIcons = toolbarIcons;
    this.config = config; // 编辑器配置
}
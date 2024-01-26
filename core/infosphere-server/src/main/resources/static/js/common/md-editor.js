const defaultEditorId = 'infosphere-md-editor';

const MdEditor = function () {

    /**
     * init properties
     * @returns {{}}
     */
    const initConfig = function (editor, config) {
        if (config instanceof EditorConfigEntity) {
            const options = {};
            options.path = config.libPath;
            options.width = config.width;
            options.height = config.height;
            options.markdown = editor.markdown;
            options.tocContainer = editor.tocContainer;
            options.mode = editor.mode;
            options.toolbarIcons = editor.toolbarIcons;
            return options;
        }
        throw Error('infosphere editor config is error!');
    };
    let CODE_EDITOR;

    /**
     * 初始化编辑器
     * @param editor 编辑器信息
     * @param config 编辑器配置
     */
    const initEditor = function (editor, config) {
        if (editor === 'undefined' || editor === '' || editor === null) {
            editor = new EditorEntity(defaultEditorId, null, null);
            config = new EditorConfigEntity('100%', '100%', '/static/js/vender/editor-md/lib/');
        }
        CODE_EDITOR = editormd(editor.id, initConfig(editor, config));
    };

    const initMarkdownToHTML = function (editor, config) {
        if (editor === 'undefined' || editor === '' || editor === null) {
            editor = new EditorEntity(defaultEditorId, null, null);
            config = new EditorConfigEntity('100%', '100%', '/static/js/vender/editor-md/lib/');
        }
        editormd.markdownToHTML(editor.id, initConfig(editor, config));
    };

    /**
     * set value
     * @param value
     */
    const setValue = function (value) {
        CODE_EDITOR.setValue(value);
    };

    /**
     * get value
     * @returns {*}
     */
    const getValue = function () {
        return CODE_EDITOR.getValue().trim();
    };

    const clearValue = function () {
        CODE_EDITOR.setValue('');
    };

    const undoValue = function () {
        CODE_EDITOR.undo();
    };

    const redoValue = function () {
        CODE_EDITOR.redo();
    };

    const getEditor = function () {
        return CODE_EDITOR;
    };

    return {
        initEditor: initEditor,
        initMarkdownToHTML: initMarkdownToHTML,
        setValue: setValue,
        getValue: getValue,
        clearValue: clearValue,
        undoValue: undoValue,
        redoValue: redoValue,
        getEditor: getEditor
    }

}();
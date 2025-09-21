const {loadComponent} = require("../../loader");

const MermaidExtension = {
    name: 'infosphereMermaid',
    level: 'block',

    start(src) {
        // 匹配 :::mermaid 或 ::: mermaid 开头
        const match = src.match(/^:::\s*mermaid\n/m);
        return match ? match.index : -1;
    },

    tokenizer(src, tokens) {
        // 匹配开头
        const match = src.match(/^:::\s*mermaid\n/);
        if (!match) {
            return false;
        }

        // 查找结束标记 :::
        const endIndex = src.indexOf('\n:::');
        if (endIndex === -1) {
            return false;
        }

        // 提取内容,注意开头长度现在需要用match[0].length
        const content = src.slice(match[0].length, endIndex).trim();
        const raw = src.slice(0, endIndex + 4);

        return {
            type: 'infosphereMermaid',
            raw,
            content,
            tokens: []
        };
    },

    renderer(token) {
        return loadComponent('mermaid', {
            content: token.content,
            config: {}
        });
    }
};

module.exports = MermaidExtension;
const {loadComponent} = require("../../loader");

const KaTeXExtension = {
    name: 'infosphereKatex',
    level: 'block',

    start(src) {
        // 匹配 :::katex 或 ::: katex 开头
        const match = src.match(/^:::\s*katex\n/m);
        return match ? match.index : -1;
    },

    tokenizer(src, tokens) {
        // 匹配开头
        const match = src.match(/^:::\s*katex\n/);
        if (!match) {
            return false;
        }

        // 查找结束标记 :::
        const endIndex = src.indexOf('\n:::');
        if (endIndex === -1) {
            return false;
        }

        // 提取内容
        const content = src.slice(match[0].length, endIndex).trim();
        const raw = src.slice(0, endIndex + 4);

        return {
            type: 'infosphereKatex',
            raw,
            content,
            tokens: []
        };
    },

    renderer(token) {
        return loadComponent('katex', {
            content: token.content,
            config: {}
        });
    }
};

module.exports = KaTeXExtension;
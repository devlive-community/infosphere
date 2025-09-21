const {loadComponent} = require("../../loader");

const IconExtension = {
    name: 'infosphereIcon',
    level: 'inline',

    start(src) {
        // 匹配 :icon: 或 :icon{params}: 格式
        const pattern = /:[a-zA-Z-]+(?:{[^}]+})?:/;
        const match = src.match(pattern);

        if (match) {
            // 检查是否在代码块内
            const beforeText = src.substring(0, match.index);
            const matches = beforeText.match(/`/g);
            if (matches && matches.length % 2 === 1) {
                return -1;
            }

            return match.index;
        }

        return -1;
    },

    tokenizer(src, tokens) {
        // 检查是否在代码块内
        if (src.startsWith('`') || src.indexOf('`') > -1) {
            return false;
        }

        // 支持以下格式:
        // 1. :icon-name:
        // 2. :icon-name{size}:
        // 3. :icon-name{size,color}:
        const rule = /^:([a-zA-Z-]+)(?:{([^}]+)})?:/;
        const match = rule.exec(src);

        if (match) {
            const [fullMatch, iconName, params = ''] = match;
            const [size = '20', color = 'currentColor'] = params.split(',').map(p => p.trim());

            return {
                type: 'infosphereIcon',
                raw: fullMatch,
                iconName: iconName,
                size: size,
                color: color,
                tokens: []
            };
        }
        return false;
    },

    renderer(item) {
        return loadComponent('icon', item);
    }
};

module.exports = IconExtension;
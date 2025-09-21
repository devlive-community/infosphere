const {loadComponent} = require("../../loader");

const TooltipsExtension = {
    name: 'infosphereTooltips',
    level: 'inline',
    start(src) {
        // 匹配 !tip[显示文本](tooltip内容) 格式
        const pattern = /!tip\[/;
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

        // 匹配 !tip[显示文本](tooltip内容) 格式
        const rule = /^!tip\[(.*?)\]\((.*?)\)/;
        const match = rule.exec(src);

        if (match) {
            const [fullMatch, text, tooltip] = match;

            return {
                type: 'infosphereTooltips',
                raw: fullMatch,
                text: text,
                tooltip: tooltip,
                tokens: []
            };
        }
        return false;
    },

    renderer(item) {
        const tooltipComponent = loadComponent('tooltip', {...item});
        return item.prefix || item.suffix
            ? `${item.prefix || ''}${tooltipComponent}${item.suffix || ''}`
            : tooltipComponent;
    }
};

module.exports = TooltipsExtension;
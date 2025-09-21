const {loadComponent} = require("../../loader");

const GridExtension = {
    name: 'infosphereGrid',
    level: 'block',

    start(src) {
        return src.match(/^:::\s*grid(?:\s+[\w-]+)*\s*\n/m)?.index ?? -1;
    },

    tokenizer(src, tokens) {
        const headerMatch = /^:::\s*grid((?:\s+[\w-]+)*)\s*\n/.exec(src);
        if (!headerMatch) {
            return false;
        }

        const endIndex = src.indexOf('\n:::');
        if (endIndex === -1) {
            return false;
        }

        const gridOptions = {
            cols: 2,
            gap: 4,
            responsive: true
        };

        const options = headerMatch[1];
        if (options) {
            options.trim().split(/\s+/).forEach(opt => {
                if (opt.startsWith('cols-')) {
                    gridOptions.cols = parseInt(opt.slice(5));
                }
                else if (opt.startsWith('gap-')) {
                    gridOptions.gap = parseInt(opt.slice(4));
                }
                else if (opt === 'no-responsive') {
                    gridOptions.responsive = false;
                }
            });
        }

        const headerLength = headerMatch[0].length;
        const content = src.slice(headerLength, endIndex);
        const raw = src.slice(0, endIndex + 4);

        // 分割列表项并保持原始格式
        const items = [];
        let currentItem = '';
        let inItem = false;

        content.split('\n').forEach(line => {
            const listMarkerMatch = line.match(/^(\s*)([-*+]|\d+\.)\s/);

            if (listMarkerMatch) {
                // 如果已经在处理一个项目，保存它
                if (currentItem) {
                    items.push(currentItem.trim());
                }
                // 开始新的项目，移除列表标记
                currentItem = line.slice(listMarkerMatch[0].length);
                inItem = true;
            }
            else if (inItem) {
                // 对于项目的后续行，直接添加
                currentItem += '\n' + line;
            }
        });

        // 添加最后一个项目
        if (currentItem) {
            items.push(currentItem.trim());
        }

        // 为每个项目创建 tokens
        const processedItems = items
            .filter(item => item)
            .map(item => {
                const itemTokens = this.lexer.blockTokens(item, []);
                return {
                    content: item,
                    tokens: itemTokens
                };
            });

        return {
            type: 'infosphereGrid',
            raw,
            items: processedItems,
            options: gridOptions,
            tokens: []
        };
    },

    renderer(token) {
        const processedItems = token.items.map(item => {
            return this.parser.parse(item.tokens);
        });

        return loadComponent('grid', {
            content: processedItems,
            options: token.options,
            config: {}
        });
    }
};

module.exports = GridExtension;
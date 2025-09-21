const { loadComponent } = require('../../loader')

const ButtonExtension = {
    name: 'infosphereButton',
    level: 'inline',

    start(src) {
        // 匹配 !btn[ 格式
        const pattern = /!btn\[/
        const match = src.match(pattern)

        if (match) {
            // 检查是否在代码块内
            const beforeText = src.substring(0, match.index)
            const matches = beforeText.match(/`/g)
            if (matches && matches.length % 2 === 1) {
                return -1
            }

            return match.index
        }

        return -1
    },

    tokenizer(src, tokens) {
        // 检查是否在代码块内
        if (src.startsWith('`') || src.indexOf('`') > -1) {
            return false
        }

        // 修改规则以支持两种格式:
        // 1. !btn[按钮文本](链接地址){类名}
        // 2. !btn[按钮文本]{类名}
        const rule = /^!btn\[(.*?)\](?:\((.*?)\))?(?:{(.*?)})?/
        const match = rule.exec(src)

        if (match) {
            const [fullMatch, text, link, className] = match

            return {
                type: 'infosphereButton',
                raw: fullMatch,
                text: text,
                link: link || '',  // 如果没有链接，设为空字符串
                className: className || '',
                tokens: []
            }
        }
        return false
    },

    renderer(item) {
        const buttonComponent = loadComponent('button', item)
        return item.prefix || item.suffix
            ? `${ item.prefix || '' }${ buttonComponent }${ item.suffix || '' }`
            : buttonComponent
    }
}

module.exports = ButtonExtension
const {marked} = require("marked");
const {loadComponent} = require('../../loader');
const ImageExtension = require('./image');
const LinkExtension = require('./link');
const CodeBlockExtension = require('./code-block');
const QuoteInlineCodeExtension = require('./quote-inline-code');
const HeadingExtension = require('./heading');
const AlertExtension = require('./alert');
const TabExtension = require('./tabs');
const TableExtension = require('./table');
const IssuesExtension = require("./issues");
const TooltipsExtension = require("./tooltip");
const MermaidExtension = require("./mermaid");
const DiffExtension = require("./diff");
const ButtonExtension = require("./button");
const IconExtension = require("./icon");
const GridExtension = require('./grid')
const RestApiExtension = require('./api')
const KaTeXExtension = require('./katex')
const SwitchExtension = require('./switch')
const {unescape} = require('./utils')

const renderer = {
    paragraph({tokens}) {
        return `${this.parser.parseInline(tokens)}`;
    },

    space() {
        return loadComponent('space');
    },

    hr() {
        return loadComponent('hr');
    },

    text(item) {
        return 'tokens' in item && item.tokens
            ? this.parser.parseInline(item.tokens)
            : ('escaped' in item && item.escaped ? item.text : loadComponent('span', {text: item.text}));
    },

    listitem(item) {
        item.text = this.parser.parse(item.tokens, !!item.loose);
        return loadComponent('list-item', item);
    },

    list(item) {
        let body = '';
        for (let j = 0; j < item.items.length; j++) {
            body += this.listitem(item.items[j]);
        }

        return loadComponent('list', {
            ordered: item.ordered,
            body: body
        });
    },

    image(item) {
        return loadComponent('image', {
            item
        });
    },

    codespan(item) {
        return loadComponent('span-code', {
            text: unescape(item.text)
        });
    },

    checkbox(item) {
        return loadComponent('checkbox', {
            checked: item.checked,
            text: item.text
        });
    }
};

marked.use({
    extensions: [
        ImageExtension,
        LinkExtension,
        MermaidExtension,
        CodeBlockExtension,
        QuoteInlineCodeExtension,
        HeadingExtension,
        AlertExtension,
        TabExtension,
        TableExtension,
        IssuesExtension,
        TooltipsExtension,
        DiffExtension,
        ButtonExtension,
        IconExtension,
        GridExtension,
        RestApiExtension,
        KaTeXExtension,
        SwitchExtension
    ],
    renderer,
    breaks: false
});

module.exports = marked;
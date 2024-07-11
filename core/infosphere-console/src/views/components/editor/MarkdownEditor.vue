<template>
  <MdEditor :model-value="content" :toolbars="toolbars as any" :code-foldable="false" @onChange="change"/>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

export default defineComponent({
  name: 'MarkdownEditor',
  components: { MdEditor },
  props: {
    content: {
      type: String
    }
  },
  data()
  {
    return {
      toolbars: [
        'bold',
        'underline',
        'italic',
        '-',
        'strikeThrough',
        'title',
        'sub',
        'sup',
        'quote',
        'unorderedList',
        'orderedList',
        'task', // ^2.4.0
        '-',
        'codeRow',
        'code',
        'link',
        'image',
        'table',
        'mermaid',
        'katex',
        '-',
        'revoke',
        'next',
        '=',
        'pageFullscreen',
        'fullscreen',
        'preview',
        'previewOnly',
        'htmlPreview',
        'catalog'
      ]
    }
  },
  methods: {
    change(text: string)
    {
      this.$emit('change', text)
    }
  }
})
</script>

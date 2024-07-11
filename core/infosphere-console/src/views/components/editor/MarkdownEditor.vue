<template>
  <MdPreview v-if="preview" editor-id="container" :model-value="content"/>
  <MdEditor v-else :model-value="content" :toolbars="toolbars as any" :code-foldable="false" @onChange="change"/>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { MdEditor, MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

export default defineComponent({
  name: 'MarkdownEditor',
  components: { MdPreview, MdEditor },
  props: {
    content: {
      type: String
    },
    preview: {
      type: Boolean,
      default: false
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

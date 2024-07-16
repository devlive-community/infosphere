<template>
  <div class="w-full">
    <div v-for="item in items" :key="item.identify">
      <TreeNode :item="item" :selectedKey="selectedKey" @select-item="selectItem">
        <template v-if="$slots.node" #node="{ node }">
          <slot name="node" :node="node"/>
        </template>
      </TreeNode>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Document } from '@/model/document.ts'
import TreeNode from '@/views/components/tree/TreeNode.vue'

export default defineComponent({
  name: 'DefaultTree',
  components: { TreeNode },
  props: {
    items: {
      type: Array as () => Document[],
      required: true
    },
    selectedKey: {
      type: Object as () => Document,
      required: false
    }
  },
  methods: {
    selectItem(key: Document) {
      this.$emit('select-item', key)
    }
  }
})
</script>

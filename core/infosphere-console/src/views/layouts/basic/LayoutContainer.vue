<template>
  <div>
    <div class="hidden flex-col md:flex">
      <LayoutHeader/>
      <div class="flex-1 space-y-4 min-h-[650px]">
        <RouterView/>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import LayoutHeader from '@/views/layouts/basic/components/LayoutHeader.vue'

export default defineComponent({
  name: 'LayoutContainer',
  components: { LayoutHeader }
})
</script>

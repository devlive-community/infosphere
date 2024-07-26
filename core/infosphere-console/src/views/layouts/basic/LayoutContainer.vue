<template>
  <div class="flex flex-col min-h-screen">
    <LayoutHeader/>
    <div class="flex-1 space-y-4 min-h-[700px] px-3">
      <RouterView/>
    </div>
    <LayoutFooter class="mt-2"/>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import LayoutHeader from '@/views/layouts/basic/components/LayoutHeader.vue'
import LayoutFooter from '@/views/layouts/basic/components/LayoutFooter.vue'

export default defineComponent({
  name: 'LayoutContainer',
  components: { LayoutFooter, LayoutHeader }
})
</script>

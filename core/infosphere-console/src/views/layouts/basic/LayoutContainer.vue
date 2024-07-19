<template>
  <div class="hidden flex-col md:flex min-h-screen">
    <LayoutHeader/>
    <div class="flex-1 space-y-4 min-h-[700px]">
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

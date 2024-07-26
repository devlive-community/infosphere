<template>
  <div class="flex flex-col md:flex">
    <LayoutHeader/>
    <div class="flex flex-col space-y-8 lg:flex-row justify-center lg:space-x-12 lg:space-y-0 mt-5 min-h-[700px] px-3">
      <aside class="-mx-4 lg:w-1/12">
        <SettingSidebar/>
      </aside>
      <div class="flex-1 lg:max-w-5xl">
        <div class="space-y-6">
          <RouterView/>
        </div>
      </div>
    </div>
  </div>
  <LayoutFooter class="mt-2"/>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import LayoutHeader from '@/views/layouts/basic/components/LayoutHeader.vue'
import SettingSidebar from '@/views/layouts/setting/components/SettingSidebar.vue'
import LayoutFooter from '@/views/layouts/basic/components/LayoutFooter.vue'

export default defineComponent({
  name: 'SettingContainer',
  components: { LayoutFooter, SettingSidebar, LayoutHeader }
})
</script>

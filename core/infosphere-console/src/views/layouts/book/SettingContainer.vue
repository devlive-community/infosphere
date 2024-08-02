<template>
  <div>
    <LayoutHeader/>
    <div class="flex flex-col space-y-8 lg:flex-row justify-center lg:space-x-12 lg:space-y-0 mt-5 min-h-[700px] px-3">
      <div class="hidden w-[200px] md:block">
        <SettingSidebar/>
      </div>
      <div class="flex-1 lg:max-w-5xl">
        <main class="flex flex-1 flex-col gap-4 lg:gap-6">
          <RouterView/>
        </main>
      </div>
    </div>
  </div>
  <LayoutFooter class="mt-2"/>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import LayoutHeader from '@/views/layouts/basic/components/LayoutHeader.vue'
import SettingSidebar from '@/views/layouts/book/components/SettingSidebar.vue'
import LayoutFooter from '@/views/layouts/basic/components/LayoutFooter.vue'

export default defineComponent({
  name: 'SettingContainer',
  components: { LayoutFooter, SettingSidebar, LayoutHeader }
})
</script>

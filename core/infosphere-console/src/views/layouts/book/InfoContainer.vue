<template>
  <div>
    <LayoutHeader/>
    <div class="flex flex-col space-y-8 lg:flex-row justify-center lg:space-x-12 lg:space-y-0 mt-5 min-h-[700px]">
      <div class="hidden lg:w-[200px] md:block">
        <InfoSidebar/>
      </div>
      <div class="flex-1 lg:max-w-5xl">
        <main class="flex flex-1 flex-col gap-4 lg:gap-6">
          <RouterView/>
        </main>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import LayoutHeader from '@/views/layouts/basic/components/LayoutHeader.vue'
import InfoSidebar from '@/views/layouts/book/components/InfoSidebar.vue'

export default defineComponent({
  name: 'InfoContainer',
  components: { InfoSidebar, LayoutHeader }
})
</script>

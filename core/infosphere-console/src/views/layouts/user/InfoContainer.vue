<template>
  <div>
    <LayoutHeader/>
    <div class="flex flex-row space-x-3 justify-center mt-5 min-h-[700px]">
      <div class="w-[300px]">
        <UserSidebar/>
      </div>
      <div class="flex-1 max-w-5xl">
        <main class="flex flex-1 flex-col gap-6">
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
import LayoutFooter from '@/views/layouts/basic/components/LayoutFooter.vue'
import UserSidebar from '@/views/layouts/user/components/UserSidebar.vue'

export default defineComponent({
  name: 'InfoContainer',
  components: { UserSidebar, LayoutFooter, LayoutHeader }
})
</script>
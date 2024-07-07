<template>
  <header class="font-sans tracking-wide relative z-50 border-b">
    <div class="flex flex-wrap items-center gap-4 px-10 bg-white min-h-[60px] w-full justify-between">
      <a href="/">
        <img src="/images/logo.png" alt="logo" class='w-12 h-12'/>
      </a>

      <div class="max-lg:hidden lg:!block max-lg:before:fixed max-lg:before:bg-black max-lg:before:opacity-50 max-lg:before:inset-0 max-lg:before:z-50 ml-3">
        <ul class="lg:flex lg:gap-x-5 max-lg:space-y-3 max-lg:fixed max-lg:bg-white max-lg:w-1/2 max-lg:min-w-[300px] max-lg:top-0 max-lg:left-0 max-lg:p-6 max-lg:h-full max-lg:shadow-md max-lg:overflow-auto z-50">
          <li class="max-lg:border-b border-gray-300 max-lg:py-3 px-3">
            <RouterLink class="flex items-center space-x-2" to="/">
              <HomeIcon :size="18"/>
              <span>首页</span>
            </RouterLink>
          </li>
        </ul>
      </div>

      <div class="flex ml-auto space-x-3">
        <Button variant="ghost">登录</Button>
        <Button variant="secondary">注册</Button>
      </div>
    </div>
  </header>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Button } from '@/components/ui/button'
import { HomeIcon } from 'lucide-vue-next'

export default defineComponent({
  name: 'LayoutHeader',
  components: { Button, HomeIcon }
})
</script>

<template>
  <div class='h-svh'>
    <div class='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
      <h1 class='text-[7rem] font-bold leading-tight'>403</h1>
      <span class='font-medium'>哎呀！页面未授权！</span>
      <p class='text-center text-muted-foreground mt-6'>抱歉，您没有权限访问该页面。</p>
      <div class='mt-6 flex gap-4'>
        <RouterLink to="/">
          <Button variant='outline'>返回首页</Button>
        </RouterLink>
        <RouterLink to="/login">
          <Button variant='outline'>登录</Button>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Button } from '@/components/ui/button'

export default defineComponent({
  name: 'AuthorizedHome',
  components: { Button }
})
</script>

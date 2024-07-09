<template>
  <div class='h-svh'>
    <div class='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
      <h1 class='text-[7rem] font-bold leading-tight'>403</h1>
      <span class='font-medium'>当前用户已经登录</span>
      <p class='text-center text-muted-foreground mt-6'>当前用户已经登录，无法执行后续操作。</p>
      <div class='mt-6 flex gap-4 space-x-2'>
        <RouterLink to="/">
          <Button variant='outline'>返回主页</Button>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Button } from '@/components/ui/button'

export default defineComponent({
  name: 'LoggedInHome',
  components: { Button }
})
</script>

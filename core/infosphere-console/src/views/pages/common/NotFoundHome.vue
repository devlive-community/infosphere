<template>
  <div class='h-svh'>
    <div class='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
      <h1 class='text-[7rem] font-bold leading-tight'>404</h1>
      <span class='font-medium'>哎呀！页面未找到！</span>
      <div class='mt-6 flex gap-4'>
        <RouterLink to="/">
          <Button variant='outline'>返回首页</Button>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Button } from '@/components/ui/button'

export default defineComponent({
  name: 'NotFoundHome',
  components: { Button }
})
</script>

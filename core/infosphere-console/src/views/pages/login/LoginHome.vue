<template>
  <div class="container grid h-svh flex-col items-center justify-center bg-primary-foreground lg:max-w-none lg:px-0">
    <div class="w-full lg:grid lg:min-h-[600px] xl:min-h-[800px]">
      <div class="flex items-center justify-center py-12">
        <div class="mx-auto grid w-[350px] gap-6">
          <div class="grid gap-2 text-center">
            <h1 class="text-3xl font-bold">InfoSphere 登录</h1>
            <p class="text-balance text-muted-foreground">登录您的账号密码体验系统各种功能。</p>
          </div>
          <div class="grid gap-4">
            <div class="grid gap-2">
              <Label for="email">邮箱地址</Label>
              <Input id="email" type="email" placeholder="请输入注册时用的邮箱地址" required/>
            </div>
            <div class="grid gap-2">
              <div class="flex items-center">
                <Label for="password">用户密码</Label>
                <a href="#" class="ml-auto inline-block text-sm underline">找回密码?</a>
              </div>
              <Input id="password" type="password" required placeholder="请输入账号绑定密码"/>
            </div>
            <Button type="submit" class="w-full">登录</Button>
          </div>
          <div class="mt-4 text-center text-sm">
            还没有账号
            <RouterLink to="#" class="underline">立即注册</RouterLink>
          </div>
        </div>
      </div>
<!--      <div class="hidden bg-muted lg:block">-->
<!--        <Image class="h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"/>-->
<!--      </div>-->
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default defineComponent({
  name: 'LoginHome',
  components: { Button, Input, Label }
})
</script>

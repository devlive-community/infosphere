<template>
  <div class="container grid h-svh flex-col items-center justify-center bg-primary-foreground lg:max-w-none lg:px-0">
    <div class="w-full lg:grid lg:min-h-[600px] xl:min-h-[800px]">
      <div class="flex items-center justify-center py-12">
        <div class="mx-auto grid w-[350px] gap-6">
          <div class="grid gap-2 text-center">
            <h1 class="text-3xl font-bold">InfoSphere 注册</h1>
          </div>
          <div class="grid gap-4">
            <div class="grid gap-2">
              <Label for="username">用户名</Label>
              <Input id="username" type="text" placeholder="由英文字母数字组成，限3-50个字符" required/>
            </div>
            <div class="grid gap-2">
              <div class="flex items-center">
                <Label for="password">登录密码</Label>
              </div>
              <Input id="password" type="password" required placeholder="请输入账号绑定密码,密码必须在6-50个字符之间"/>
            </div>
            <div class="grid gap-2">
              <div class="flex items-center">
                <Label for="conformPassword">确认密码</Label>
              </div>
              <Input id="conformPassword" type="password" required placeholder="请输入账号绑定密码,密码必须在6-50个字符之间"/>
            </div>
            <div class="grid gap-2">
              <Label for="email">邮箱地址</Label>
              <Input id="email" type="email" placeholder="请输入注册用的邮箱地址" required/>
            </div>
            <Button type="submit" class="w-full">注册</Button>
          </div>
          <div class="mt-4 text-center text-sm">
            已有账号?
            <RouterLink to="login" class="underline">立即登录</RouterLink>
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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export default defineComponent({
  name: 'RegisterHome',
  components: { Label, Button, Input }
})
</script>

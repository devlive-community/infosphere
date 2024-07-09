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
            <Alert v-if="message" variant="destructive">
              <AlertDescription>{{ message }}</AlertDescription>
            </Alert>
            <form class="space-y-6" @submit="onSubmit">
              <div class="grid gap-2">
                <FormField v-slot="{ componentField }" name="email">
                  <FormItem>
                    <FormLabel>邮箱地址</FormLabel>
                    <FormControl>
                      <Input type="text" v-model="formState.email" v-bind="componentField" placeholder="请输入注册时用的邮箱地址"/>
                    </FormControl>
                    <FormMessage/>
                  </FormItem>
                </FormField>
              </div>
              <div class="grid gap-2">
                <FormField v-slot="{ componentField }" name="password">
                  <FormItem>
                    <div class="flex items-center">
                      <FormLabel>用户密码</FormLabel>
                      <!--                      <a href="#" class="ml-auto inline-block text-sm underline">找回密码?</a>-->
                    </div>
                    <FormControl>
                      <Input type="password" v-model="formState.password" v-bind="componentField" placeholder="请输入账号绑定密码"/>
                    </FormControl>
                    <FormMessage/>
                  </FormItem>
                </FormField>
              </div>
              <Button type="submit" class="w-full" :disabled="loading">
                <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin"/>
                登录
              </Button>
            </form>
          </div>
          <div class="mt-4 text-center text-sm">
            还没有账号
            <RouterLink to="register" class="underline">立即注册</RouterLink>
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
import { defineComponent, ref } from 'vue'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { z } from 'zod'
import { Auth, User } from '@/model/user.ts'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { Loader2 } from 'lucide-vue-next'
import UserService from '@/service/user.ts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { TokenUtils } from '@/lib/token.ts'
import router from '@/router'
import { useUserStore } from '@/stores/user.ts'

export default defineComponent({
  name: 'LoginHome',
  components: {
    AlertDescription, Alert,
    FormMessage, FormControl, FormLabel, FormField, FormItem,
    Button, Input, Label, Loader2
  },
  setup()
  {
    const userStore = useUserStore()
    let loading = ref(false)
    const formState = ref<User>({ email: undefined, password: undefined })
    const message = ref<string | null>(null)
    const validator = z
        .object({
          email: z.string({ required_error: '邮箱地址不能为空' })
                  .email('邮箱地址格式不正确'),
          password: z.string({ required_error: '用户密码不能为空' })
                     .min(6, '密码必须在6-20个字符之间')
                     .max(20, '密码必须在6-20个字符之间')
        })

    const { handleSubmit } = useForm({
      validationSchema: toTypedSchema(validator)
    })

    const onSubmit = handleSubmit(() => {
      loading.value = true
      UserService.login(formState.value)
                 .then(response => {
                   if (response.status) {
                     message.value = null
                     TokenUtils.setAuthUser(response.data as Auth)
                     userStore.isLogin = true
                     router.push('/')
                   }
                   else {
                     message.value = response.message as string
                   }
                 })
                 .finally(() => loading.value = false)
    })

    return {
      loading,
      formState,
      onSubmit,
      message
    }
  }
})
</script>

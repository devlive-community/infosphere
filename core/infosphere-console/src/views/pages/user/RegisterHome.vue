<template>
  <div class="container grid h-svh flex-col items-center justify-center bg-primary-foreground lg:max-w-none lg:px-0">
    <div class="w-full lg:grid lg:min-h-[600px] xl:min-h-[800px]">
      <div class="flex items-center justify-center py-12">
        <div class="mx-auto grid w-[350px] gap-6">
          <div class="grid gap-2 text-center">
            <h1 class="text-3xl font-bold">InfoSphere 注册</h1>
          </div>


          <div class="grid gap-4">
            <Alert v-if="message" variant="destructive">
              <AlertDescription>{{ message }}</AlertDescription>
            </Alert>
            <form class="space-y-6" @submit="onSubmit">
              <div class="grid gap-2">
                <FormField v-slot="{ componentField }" name="username">
                  <FormItem>
                    <FormLabel>用户名</FormLabel>
                    <FormControl>
                      <Input type="text" v-model="formState.username" v-bind="componentField" placeholder="由英文字母数字组成，限3-20个字符"/>
                    </FormControl>
                    <FormMessage/>
                  </FormItem>
                </FormField>
              </div>
              <div class="grid gap-2">
                <FormField v-slot="{ componentField }" name="password">
                  <FormItem>
                    <div class="flex items-center">
                      <FormLabel>登录密码</FormLabel>
                    </div>
                    <FormControl>
                      <Input type="password" v-model="formState.password" v-bind="componentField" placeholder="请输入账号绑定密码"/>
                    </FormControl>
                    <FormMessage/>
                  </FormItem>
                </FormField>
              </div>
              <div class="grid gap-2">
                <FormField v-slot="{ componentField }" name="confirmPassword">
                  <FormItem>
                    <div class="flex items-center">
                      <FormLabel>确认密码</FormLabel>
                    </div>
                    <FormControl>
                      <Input type="password" v-model="formState.confirmPassword" v-bind="componentField" placeholder="请输入账号确认密码"/>
                    </FormControl>
                    <FormMessage/>
                  </FormItem>
                </FormField>
              </div>
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
              <Button type="submit" class="w-full" :disabled="loading">
                <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin"/>
                注册
              </Button>
            </form>
            <div class="mt-4 text-center text-sm">
              已有账号?
              <RouterLink to="login" class="underline">立即登录</RouterLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import UserService from '@/service/user.ts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { Loader2 } from 'lucide-vue-next'
import { z } from 'zod'
import { User } from '@/model/user.ts'
import router from '@/router'
import { toast } from 'vue3-toastify'

export default defineComponent({
  name: 'RegisterHome',
  components: {
    AlertDescription, Alert,
    FormMessage, FormControl, FormLabel, FormField, FormItem,
    Button, Input, Label, Loader2
  },
  setup()
  {
    let loading = ref(false)
    const formState = ref<User>({ username: undefined, email: undefined, password: undefined, confirmPassword: undefined })
    const message = ref<string | null>(null)
    const validator = z
        .object({
          username: z.string({ required_error: '用户名不能为空' })
                     .min(3, '用户名必须在3-20个字符之间')
                     .max(20, '用户名必须在3-20个字符之间'),
          password: z.string({ required_error: '用户密码不能为空' })
                     .min(6, '密码必须在6-20个字符之间')
                     .max(20, '密码必须在6-20个字符之间'),
          confirmPassword: z.string({ required_error: '用户确认密码不能为空' })
                            .min(6, '密码必须在6-20个字符之间')
                            .max(20, '密码必须在6-20个字符之间'),
          email: z.string({ required_error: '邮箱地址不能为空' })
                  .email('邮箱地址格式不正确')
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: '密码和确认密码不一致',
          path: ['confirmPassword']
        })

    const { handleSubmit } = useForm({
      validationSchema: toTypedSchema(validator)
    })

    const onSubmit = handleSubmit(() => {
      loading.value = true
      UserService.register(formState.value)
                 .then(response => {
                   if (response.status) {
                     toast(`用户注册成功，请登录`, { type: 'success' })
                     message.value = null
                     router.push('/login')
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

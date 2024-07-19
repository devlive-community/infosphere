<template>
  <div>
    <h3 class="text-lg font-medium">修改密码</h3>
  </div>
  <Separator class="my-4"/>
  <form class="space-y-8" @submit="submit" v-if="formState">
    <FormField v-slot="{ componentField }" name="password">
      <FormItem>
        <FormLabel>旧密码</FormLabel>
        <FormControl>
          <Input type="password" v-model="formState.password" v-bind="componentField"/>
        </FormControl>
        <FormMessage/>
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="newPassword">
      <FormItem class="space-y-1">
        <FormLabel>新密码</FormLabel>
        <FormControl>
          <Input type="password" v-model="formState.newPassword" v-bind="componentField"/>
        </FormControl>
        <FormMessage/>
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="confirmPassword">
      <FormItem class="space-y-1">
        <FormLabel>确认密码</FormLabel>
        <FormControl>
          <Input v-model="formState.confirmPassword" v-bind="componentField"/>
        </FormControl>
        <FormMessage/>
      </FormItem>
    </FormField>
    <div class="flex justify-start">
      <Button :disabled="loading">
        <Loader2Icon v-if="loading" class="w-full justify-center animate-spin mr-3" :size="15"/>
        保存
      </Button>
    </div>
  </form>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'
import { Separator } from '@/components/ui/separator'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { User } from '@/model/user.ts'
import { z } from 'zod'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import router from '@/router'
import UserService from '@/service/user.ts'
import { toast } from 'vue3-toastify'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2Icon } from 'lucide-vue-next'
import { useUserStore } from '@/stores/user.ts'

export default defineComponent({
  name: 'SettingPassword',
  components: { Loader2Icon, Button, Input, FormMessage, FormControl, FormLabel, FormField, FormItem, Separator },
  setup()
  {
    const userStore = useUserStore()
    let loading = ref(false)
    const formState = ref<User>({ password: undefined, newPassword: undefined, confirmPassword: undefined })
    const validator = z
        .object({
          password: z.string({ required_error: '用户密码不能为空' })
                     .min(6, '密码必须在6-20个字符之间')
                     .max(20, '密码必须在6-20个字符之间'),
          newPassword: z.string({ required_error: '用户密码不能为空' })
                        .min(6, '密码必须在6-20个字符之间')
                        .max(20, '密码必须在6-20个字符之间'),
          confirmPassword: z.string({ required_error: '用户密码不能为空' })
                            .min(6, '密码必须在6-20个字符之间')
                            .max(20, '密码必须在6-20个字符之间')
        })
        .refine((data) => data.newPassword === data.confirmPassword, {
          message: '新密码和确认密码不一致',
          path: ['confirmPassword']
        })
    const formSchema = toTypedSchema(validator)

    const { handleSubmit } = useForm({
      validationSchema: formSchema
    })

    const submit = handleSubmit(() => {
      loading.value = true
      UserService.changePassword(formState.value as User)
                 .then((response) => {
                   if (response.status) {
                     toast(`密码修改成功，请重新登录`, { type: 'success' })
                     userStore.logout()
                     router.push('/login')
                   }
                   else {
                     toast(response.message as string, { type: 'error' })
                   }
                 })
                 .finally(() => loading.value = false)
    })

    return {
      loading,
      formState,
      submit
    }
  }
})
</script>

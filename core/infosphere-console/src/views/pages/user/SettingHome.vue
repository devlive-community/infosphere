<template>
  <div class="w-full">
    <div>
      <h3 class="text-lg font-medium">基本信息</h3>
      <p class="text-sm text-muted-foreground">这里主要展示的是一些个人的基本信息，包含了一些头像，昵称等信息。</p>
    </div>
    <Separator class="my-4"/>
    <div>
      <Loader2Icon v-if="loading" class="w-5 h-5 animate-spin"/>
      <form class="space-y-8" v-else-if="formState">
        <FormField name="username">
          <FormItem>
            <FormLabel>用户名</FormLabel>
            <FormControl>
              <Input :disabled="true" v-model="formState.username"/>
            </FormControl>
          </FormItem>
        </FormField>
        <FormField name="aliasName">
          <FormItem class="space-y-1">
            <FormLabel>昵称</FormLabel>
            <FormControl>
              <Input v-model="formState.aliasName"/>
            </FormControl>
          </FormItem>
        </FormField>
        <FormField name="email">
          <FormItem class="space-y-1">
            <FormLabel>邮箱</FormLabel>
            <FormControl>
              <Input type="email" v-model="formState.email"/>
            </FormControl>
          </FormItem>
        </FormField>
        <FormField name="signature">
          <FormItem class="space-y-1">
            <FormLabel>简介</FormLabel>
            <FormControl>
              <Textarea :model-value="formState.signature" @update:model-value="formState.signature = $event as string" rows="4"/>
            </FormControl>
          </FormItem>
        </FormField>
        <div class="flex justify-start">
          <Button :disabled="saving" @click="submit()">
            <Loader2Icon v-if="saving" class="w-full justify-center animate-spin mr-3" :size="15"/>
            保存
          </Button>
        </div>
      </form>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { User } from '@/model/user.ts'
import { Input } from '@/components/ui/input'
import { Loader2Icon } from 'lucide-vue-next'
import UserService from '@/service/user.ts'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'vue3-toastify'

export default defineComponent({
  name: 'SettingHome',
  components: { Textarea, Button, Separator, Input, FormControl, FormLabel, FormField, FormItem, Loader2Icon },
  data()
  {
    return {
      loading: false,
      saving: false,
      formState: null as User | null
    }
  },
  created()
  {
    this.initialize()
  },
  methods: {
    initialize()
    {
      this.loading = true
      UserService.getInfo()
                 .then(response => {
                   if (response.status) {
                     const { username, aliasName, email, signature } = response.data
                     const payload = { username, aliasName, email, signature }
                     this.formState = payload
                   }
                 })
                 .finally(() => this.loading = false)
    },
    submit()
    {
      this.saving = true
      UserService.save(this.formState as User)
                 .then(response => {
                   if (response.status) {
                     toast(`保存 [ ${ this.formState?.username } ] 成功`, { type: 'success' })
                   }
                 })
                 .finally(() => this.saving = false)
    }
  }
})
</script>

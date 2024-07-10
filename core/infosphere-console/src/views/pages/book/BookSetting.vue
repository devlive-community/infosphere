<template>
  <form class="space-y-6" @submit="submit" v-if="formState">
    <FormField v-slot="{ componentField }" name="name">
      <FormItem>
        <FormLabel>书籍名称</FormLabel>
        <FormControl>
          <Input v-model="formState.name" v-bind="componentField" placeholder="书籍名称"/>
        </FormControl>
        <FormMessage/>
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="identify">
      <FormItem class="space-y-1">
        <FormLabel>书籍标记</FormLabel>
        <FormControl>
          <Input v-model="formState.identify" v-bind="componentField" placeholder="书籍标记"/>
        </FormControl>
        <FormMessage/>
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="visibility">
      <FormItem class="space-y-2">
        <FormLabel>书籍可见性</FormLabel>
        <FormControl>
          <RadioGroup v-model="formState.visibility" :default-value="formState.visibility as string" v-bind="componentField">
            <div class="flex space-x-4">
              <div class="flex items-center space-x-2">
                <RadioGroupItem id="public" value="true"/>
                <Label for="public">
                  <span class="mr-2 font-bold">公开</span>(任何人都可以访问)
                </Label>
              </div>
              <div class="flex items-center space-x-2">
                <RadioGroupItem id="private" value="false"/>
                <Label for="private">
                  <span class="mr-2 font-bold">私有</span>(只有参与者才能访问)
                </Label>
              </div>
            </div>
          </RadioGroup>
        </FormControl>
        <FormMessage/>
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="description">
      <FormItem class="space-y-1">
        <FormLabel>书籍描述</FormLabel>
        <FormControl>
          <Textarea v-model="formState.description" v-bind="componentField" rows="4" placeholder="书籍描述"/>
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
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2Icon } from 'lucide-vue-next'
import { z } from 'zod'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { toast } from 'vue3-toastify'
import { Book } from '@/model/book.ts'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import BookService from '@/service/book.ts'

export default defineComponent({
  name: 'BookSetting',
  components: { RadioGroupItem, Label, RadioGroup, Textarea, Loader2Icon, FormField, FormControl, FormMessage, Button, Input, FormLabel, FormItem },
  setup()
  {
    let loading = ref(false)
    const formState = ref<Book>({ name: undefined, cover: undefined, identify: undefined, description: undefined, visibility: undefined })
    const validator = z
        .object({
          name: z.string({ required_error: '书籍名称不能为空' })
                 .min(6, '书籍名称在6-50个字符之间')
                 .max(50, '书籍名称在6-50个字符之间'),
          identify: z.string({ required_error: '书籍标记不能为空' })
                     .min(6, '密码必须在6-100个字符之间')
                     .max(100, '密码必须在6-100个字符之间'),
          visibility: z.enum(['true', 'false'], { required_error: '书籍可见性不能为空' })
        })
    const formSchema = toTypedSchema(validator)

    const { handleSubmit } = useForm({
      validationSchema: formSchema
    })

    const submit = handleSubmit(() => {
      loading.value = true
      BookService.saveOrUpdate(formState.value as Book)
                 .then((response) => {
                   if (response.status) {
                     toast(`创建书籍 [ ${ formState.value?.name } ] 成功`, { type: 'success' })
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

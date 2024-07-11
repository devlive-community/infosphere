<template>
  <InfoSphereLoading v-if="loading" :show="loading"/>
  <Card v-else-if="formState" class="w-full rounded-sm border-0 shadow-background">
    <CardHeader class="space-y-1.5 p-0">
      <CardTitle class="space-x-4 flex items-center">
        <CogIcon class="w-5 h-5"/>
        <span class="font-bold text-2xl">书籍设置</span>
      </CardTitle>
    </CardHeader>
    <Separator class="mt-2 mb-1 bg-gray-100"/>
    <CardContent class="p-3 pl-6 pr-6 space-y-6">
      <form class="space-y-6" @submit="submit">
        <FormField name="cover">
          <FormItem>
            <FormLabel>书籍封面</FormLabel>
            <FormControl>
              <CropperHome :pic="formState.cover" @update:value="cropper"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>
        <FormField v-slot="{ componentField }" name="name">
          <FormItem>
            <FormLabel>书籍名称</FormLabel>
            <FormControl>
              <Input v-model="formState.name" :default-value="formState.name as string" v-bind="componentField" placeholder="书籍名称"
                     @input="updateModelValue('name', $event.target.value)"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>
        <FormField v-slot="{ componentField }" name="identify">
          <FormItem class="space-y-1">
            <FormLabel>书籍标记</FormLabel>
            <FormControl>
              <Input v-model="formState.identify" :disabled="formState.id" :default-value="formState.identify as string" v-bind="componentField" placeholder="书籍标记"
                     @input="updateModelValue('identify', $event.target.value)"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>
        <FormField v-slot="{ componentField }" name="visibility">
          <FormItem class="space-y-2">
            <FormLabel>书籍可见性</FormLabel>
            <FormControl>
              <RadioGroup v-model="formState.visibility" :default-value="formState.visibility?.toString()" v-bind="componentField">
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
          <Textarea v-model="formState.description" :default-value="formState.description as string" v-bind="componentField" rows="4" placeholder="书籍描述"
                    @input="updateModelValue('description', $event.target.value)"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>
        <div class="flex justify-start">
          <Button :disabled="saving">
            <Loader2Icon v-if="saving" class="w-full justify-center animate-spin mr-3" :size="15"/>
            保存
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>
</template>

<script lang="ts">
import { defineComponent, onMounted, reactive, ref } from 'vue'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CogIcon, Loader2Icon } from 'lucide-vue-next'
import { z } from 'zod'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { Book } from '@/model/book.ts'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import BookService from '@/service/book.ts'
import { useRouter } from 'vue-router'
import InfoSphereLoading from '@/views/components/loading/InfoSphereLoading.vue'
import { toast } from 'vue3-toastify'
import router from '@/router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import CropperHome from '@/views/components/cropper/CropperHome.vue'
import UploadService from '@/service/upload.ts'

export default defineComponent({
  name: 'BookSetting',
  components: {
    CropperHome,
    CogIcon, Loader2Icon,
    CardContent, CardHeader, CardTitle, Card,
    InfoSphereLoading,
    Label, Separator, Textarea, Button, Input,
    RadioGroupItem, RadioGroup,
    FormField, FormControl, FormMessage, FormLabel, FormItem
  },
  setup()
  {
    const loading = ref(false)
    const saving = ref(false)
    const formState = reactive<Record<string, any>>({ id: undefined, name: undefined, cover: undefined, identify: undefined, description: undefined, visibility: undefined })
    const validator = z
        .object({
          name: z.string({ required_error: '书籍名称不能为空' })
                 .min(2, '书籍名称在2-50个字符之间')
                 .max(50, '书籍名称在2-50个字符之间'),
          identify: z.string({ required_error: '书籍标记不能为空' })
                     .min(2, '书籍标记必须在2-100个字符之间')
                     .max(100, '书籍标记必须在2-100个字符之间'),
          visibility: z.enum(['true', 'false'], { required_error: '书籍可见性不能为空' })
        })
    const formSchema = toTypedSchema(validator)
    const tip = ref<string | null>(null)

    const { handleSubmit, setValues } = useForm({
      validationSchema: formSchema
    })

    // 获取原始数据更新数据模型
    onMounted(() => {
      const router = useRouter()
      const params = router.currentRoute.value.params
      const identify = params['identify'] as string

      if (identify) {
        loading.value = true
        BookService.getByIdentify(identify)
                   .then(response => {
                     const data = response.data
                     const newValue = {
                       id: data.id,
                       name: data.name,
                       cover: data.cover,
                       identify: data.identify,
                       description: data.description,
                       visibility: data.visibility.toString()
                     }
                     setValues(newValue)
                     Object.assign(formState, newValue)
                     tip.value = `更新书籍 [ ${ formState?.name } ] 成功`
                   })
                   .finally(() => loading.value = false)
      }
    })

    // 由于中文输入法问题，使用 v-model 未更新数据，需要手动更新
    const updateModelValue = (field: string, value: any) => {
      formState[field] = value
    }

    // 上传书籍封面
    const cropper = (value: any) => {
      const configure = { mode: 'cover', file: value }
      UploadService.upload(configure)
                   .then(response => {
                     if (response.status) {
                       formState['cover'] = response.data
                     }
                     else {
                       toast(response.message as string, { type: 'error' })
                     }
                   })
    }

    const submit = handleSubmit(() => {
      saving.value = true
      BookService.saveOrUpdate(formState as Book)
                 .then((response) => {
                   if (response.status) {
                     toast(tip.value ? tip.value : `创建书籍 [ ${ formState?.name } ] 成功`, { type: 'success' })
                     router.push(`/book/info/${ response.data.identify }`)
                   }
                   else {
                     toast(response.message as string, { type: 'error' })
                   }
                 })
                 .finally(() => saving.value = false)
    })

    return {
      loading,
      saving,
      formState,
      submit,
      updateModelValue,
      cropper
    }
  }
})
</script>

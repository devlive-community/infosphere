<template>
  <InfoSphereDialog v-if="visible" :is-visible="visible" title="添加文档" :width="'80%'" @close="visible = $event">
    <div class="pl-3 pr-3 pb-3">
      <form class="space-y-6" @submit="submit">
        <FormField v-slot="{ componentField }" name="name">
          <FormItem>
            <FormLabel>文档名称</FormLabel>
            <FormControl>
              <Input v-model="formState.name" :default-value="formState.name as string" v-bind="componentField" placeholder="文档名称"
                     @input="updateModelValue('name', $event.target.value)"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>
        <FormField v-slot="{ componentField }" name="identify">
          <FormItem class="space-y-1">
            <FormLabel>文档标记</FormLabel>
            <FormControl>
              <Input v-model="formState.identify" :disabled="formState.id" :default-value="formState.identify as string" v-bind="componentField" placeholder="文档标记"
                     @input="updateModelValue('identify', $event.target.value)"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>
        <Separator/>
        <div class="flex justify-start space-x-2">
          <Button variant="secondary" size="sm" @click="visible = false">
            取消
          </Button>
          <Button size="sm" :disabled="saving">
            <Loader2Icon v-if="saving" class="w-full justify-center animate-spin mr-3" :size="15"/>
            保存
          </Button>
        </div>
      </form>
    </div>
  </InfoSphereDialog>
</template>

<script lang="ts">
import { defineComponent, onMounted, reactive, ref } from 'vue'
import { Button } from '@/components/ui/button'
import InfoSphereDialog from '@/views/components/dialog/InfoSphereDialog.vue'
import { z } from 'zod'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import DocumentService from '@/service/document.ts'
import { toast } from 'vue3-toastify'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import CropperHome from '@/views/components/cropper/CropperHome.vue'
import { Loader2Icon } from 'lucide-vue-next'
import { RadioGroup } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { useRouter } from 'vue-router'

export default defineComponent({
  name: 'BookTitle',
  components: { Separator, RadioGroup, Loader2Icon, FormField, FormControl, FormMessage, CropperHome, Input, FormLabel, Textarea, FormItem, InfoSphereDialog, Button },
  props: {
    isVisible: {
      type: Boolean
    },
    editor: {
      type: String
    }
  },
  computed: {
    visible: {
      get(): boolean
      {
        return this.isVisible
      },
      set(value: boolean)
      {
        this.$emit('close', value)
      }
    }
  },
  setup(props, { emit })
  {
    const loading = ref(false)
    const saving = ref(false)
    const identify = ref<string | null>(null)
    const formState = reactive<Record<any, any>>({ id: undefined, name: undefined, identify: undefined, editor: props.editor, book: { identify: undefined } })
    const validator = z
        .object({
          name: z.string({ required_error: '文档名称不能为空' })
                 .min(2, '文档名称在2-100个字符之间')
                 .max(100, '文档名称在2-100个字符之间'),
          identify: z.string({ required_error: '文档标记不能为空' })
                     .min(2, '文档标记必须在2-100个字符之间')
                     .max(100, '文档标记必须在2-100个字符之间')
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
      identify.value = params['identify'] as string
    })

    // 由于中文输入法问题，使用 v-model 未更新数据，需要手动更新
    const updateModelValue = (field: string, value: any) => {
      formState[field] = value
    }

    const submit = handleSubmit(() => {
      saving.value = true
      formState['book']['identify'] = identify.value
      DocumentService.saveOrUpdate(formState)
                     .then((response) => {
                       if (response.status) {
                         toast(tip.value ? tip.value : `创建文档 [ ${ formState?.name } ] 成功`, { type: 'success' })
                         emit('close', false)
                         emit('onSuccess', response.data)
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
      updateModelValue
    }
  }
})
</script>

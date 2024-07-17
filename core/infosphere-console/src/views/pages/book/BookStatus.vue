<template>
  <InfoSphereLoading v-if="loading" :show="loading"/>
  <Card v-else-if="info" class="w-full rounded-sm border-0 shadow-background">
    <CardHeader class="space-y-1.5 p-0">
      <CardTitle class="space-x-4 flex items-center">
        <SatelliteIcon class="w-5 h-5"/>
        <span class="font-bold text-2xl">书籍状态</span>
      </CardTitle>
    </CardHeader>
    <Separator class="mt-2 mb-1 bg-gray-100"/>
    <CardContent class="p-0 pt-3 space-y-6">
      <div class="w-full space-y-3">
        <div class="space-y-2 border-2 bg-amber-100 border-amber-200 rounded-md p-3">
          <div class="flex items-center space-x-2">
            <Label>进行中</Label>
            <span class="text-xs text-gray-500">正常进行的书籍，可以进行所有操作</span>
          </div>
          <div class="flex items-center space-x-2">
            <Label>暂停中</Label>
            <span class="text-xs text-gray-500">暂停中的书籍，无法进行写操作</span>
          </div>
          <div class="flex items-center space-x-2">
            <Label>已停止</Label>
            <span class="text-xs text-gray-500">已停止的书籍，无法进行写文档，可以进行只读操作</span>
          </div>
          <div class="flex items-center space-x-2">
            <Label>已完结</Label>
            <span class="text-xs text-gray-500">已完结的书籍，只能进行只读访问，无法进行写操作</span>
          </div>
        </div>
        <div class="space-y-2">
          <Label class="text-gray-400">书籍状态:</Label>
          <Select v-model="info.state" :default-value="info.state">
            <SelectTrigger class="w-[180px]">
              <SelectValue placeholder="请选择书籍状态"/>
            </SelectTrigger>
            <SelectContent>
              <SelectItem class="cursor-pointer" value="STARTED">进行中</SelectItem>
              <SelectItem class="cursor-pointer" value="PAUSED">暂停中</SelectItem>
              <SelectItem class="cursor-pointer" value="STOPPED">已停止</SelectItem>
              <SelectItem class="cursor-pointer" value="FINISHED">已完结</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex justify-start">
          <Button :disabled="saving" @click="save">
            <Loader2Icon v-if="saving" class="w-full justify-center animate-spin mr-3" :size="15"/>
            保存
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import InfoSphereLoading from '@/views/components/loading/InfoSphereLoading.vue'
import { Loader2Icon, SatelliteIcon } from 'lucide-vue-next'
import InfoSphereTooltip from '@/views/components/tooltip/InfoSphereTooltip.vue'
import { Book } from '@/model/book.ts'
import { useRouter } from 'vue-router'
import BookService from '@/service/book.ts'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { toast } from 'vue3-toastify'

export default defineComponent({
  name: 'BookStatus',
  components: {
    Button,
    Loader2Icon,
    Label, Separator,
    SatelliteIcon,
    CardContent, CardFooter, InfoSphereTooltip, InfoSphereLoading, CardTitle, CardHeader, Card,
    Select,
    SelectContent,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue
  },
  data()
  {
    return {
      loading: false,
      saving: false,
      info: null as unknown as Book
    }
  },
  created()
  {
    this.initialize()
  },
  methods: {
    initialize()
    {
      const router = useRouter()
      const params = router.currentRoute.value.params
      const identify = params['identify'] as string

      this.loading = true
      BookService.getByIdentify(identify)
                 .then(response => {
                   this.info = response.data
                 })
                 .finally(() => this.loading = false)
    },
    save()
    {
      const { id, name, identify, state } = this.info
      const payload = { id, name, identify, state }
      this.saving = true
      BookService.saveOrUpdate(payload)
                 .then((response) => {
                   if (response.status) {
                     toast(`更新书籍 [ ${ payload.name } ] 成功`, { type: 'success' })
                   }
                   else {
                     toast(response.message as string, { type: 'error' })
                   }
                 })
                 .finally(() => this.saving = false)
    }
  }
})
</script>

<template>
  <InfoSphereDialog v-if="visible" :is-visible="visible" title="删除文档" :width="'80%'" @close="visible = $event">
    <InfoSphereLoading v-if="loading" :show="loading" class="mb-10"/>
    <div v-else-if="item" class="pl-3 pr-3 pb-3">
      <p class="text-red-500">删除后不可恢复，确定要删除 [<em class="ml-1 mr-1">{{ item.name }}</em>] 吗？</p>
      <div v-if="(item.children as any[]).length > 0">
        <Separator class="mt-2 mb-2 bg-gray-100"/>
        <p class="text-xs text-muted-foreground mb-2">该文档下包含 [ {{ (item.children as any[]).length }} ] 条文档，也会被同时删除。</p>
        <DefaultTree :items="item.children as any[]"/>
      </div>
    </div>
    <template #footer>
      <div class="flex justify-start space-x-2">
        <Button variant="secondary" size="sm" @click="visible = false">
          取消
        </Button>
        <Button size="sm" class="bg-red-500 hover:bg-red-400" :disabled="deleting" @click="submit">
          <Loader2Icon v-if="deleting" class="w-full justify-center animate-spin mr-3" :size="15"/>
          <span>删除</span>
        </Button>
      </div>
    </template>
  </InfoSphereDialog>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import InfoSphereDialog from '@/views/components/dialog/InfoSphereDialog.vue'
import { Loader2Icon } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { toast } from 'vue3-toastify'
import DocumentService from '@/service/document.ts'
import InfoSphereLoading from '@/views/components/loading/InfoSphereLoading.vue'
import { Document } from '@/model/document.ts'
import DefaultTree from '@/views/components/tree/DefaultTree.vue'

export default defineComponent({
  name: 'DocumentDelete',
  components: { DefaultTree, InfoSphereLoading, Separator, FormMessage, Button, FormControl, FormField, Loader2Icon, InfoSphereDialog, Input, FormLabel, FormItem },
  props: {
    isVisible: {
      type: Boolean,
      required: true
    },
    identify: {
      type: String,
      required: true
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
  data()
  {
    return {
      loading: false,
      deleting: false,
      item: null as unknown as Document
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
      DocumentService.getByIdentify(this.identify, true)
                     .then(response => this.item = response.data)
                     .finally(() => this.loading = false)
    },
    submit()
    {
      this.deleting = true
      DocumentService.deleteByIdentify(this.identify)
                     .then((response) => {
                       if (response.status) {
                         this.visible = false
                         this.$emit('close')
                       }
                       else {
                         toast(`删除失败，原因是：${ response.message as string }`, { type: 'error' })
                       }
                     })
                     .finally(() => this.deleting = false)
    }
  }
})
</script>

<template>
  <Card class="w-full rounded-sm border-0 shadow-background">
    <CardHeader class="p-0 space-y-1.5">
      <CardTitle class="space-x-4 flex items-center">
        <Menubar class="border-0 shadow-none w-full bg-gray-100 rounded-none pl-3 pr-3 flex justify-between">
          <div class="flex items-center space-x-4">
            <RouterLink :to="`/book/info/${identify}`">
              <Button size="xs" variant="outline" class="space-x-1">
                <BookOpenIcon class="w-4 h-4"/>
                <span>返回书籍</span>
              </Button>
            </RouterLink>
            <MenubarMenu>
              <MenubarTrigger class="cursor-pointer hover:bg-blue-100">文件</MenubarTrigger>
              <MenubarContent>
                <MenubarItem class="cursor-pointer" @click="changeType('Markdown')">
                  Markdown
                  <MenubarShortcut>⌘M</MenubarShortcut>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </div>
          <div class="ml-auto">
            <Button size="sm" :disabled="!contentChanged || saving" :class="cn('space-x-2', contentChanged && 'bg-green-300 hover:bg-green-400 text-white hover:text-white')"
                    variant="outline" @click="save">
              <Loader2Icon v-if="saving" class="w-5 h-5 animate-spin"/>
              <SaveIcon v-else class="w-4 h-4"/>
              <span>保存</span>
            </Button>
          </div>
        </Menubar>
      </CardTitle>
    </CardHeader>
    <CardContent class="p-0 space-y-6">
      <div class="flex flex-col lg:flex-row">
        <div class="w-[200px] overflow-x-auto overflow-y-auto h-screen" :style="{ height: 'calc(100vh - 36px)' }">
          <BookCatalog :item="item" :changed="changed" @change="change" @create-document="createDocument"/>
        </div>
        <div class="flex-1">
          <InfoSphereLoading v-if="loadingInfo" :show="loadingInfo"/>
          <MarkdownEditor v-else-if="editor === 'Markdown' && item" :content="item.content ? item.content : ''" :style="{ height: 'calc(100vh - 36px)' }" @change="changeContent"/>
          <div v-else :style="{ height: 'calc(100vh - 36px)' }">
            <div class='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
              <p class='text-center text-muted-foreground mt-6'>请在左侧选择文档或者在文件菜单下新建。</p>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
  <DocumentInfo v-if="visible" :is-visible="visible" :editor="editor" :item="item" @close="visible = $event" @onSuccess="onSuccess"/>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger
} from '@/components/ui/menubar'
import { Button } from '@/components/ui/button'
import BookCatalog from '@/views/pages/book/components/BookCatalog.vue'
import MarkdownEditor from '@/views/components/editor/MarkdownEditor.vue'
import { Document } from '@/model/document.ts'
import { BookOpenIcon, Loader2Icon, SaveIcon } from 'lucide-vue-next'
import { cn } from '@/lib/utils.ts'
import DocumentService from '@/service/document.ts'
import { toast } from 'vue3-toastify'
import { useRouter } from 'vue-router'
import DocumentInfo from '@/views/pages/book/components/DocumentInfo.vue'
import InfoSphereLoading from '@/views/components/loading/InfoSphereLoading.vue'

export default defineComponent({
  name: 'BookWriter',
  components: {
    InfoSphereLoading,
    DocumentInfo,
    BookOpenIcon,
    Loader2Icon,
    SaveIcon,
    MarkdownEditor,
    BookCatalog,
    Button,
    CardContent,
    CardFooter,
    Card,
    CardHeader,
    CardTitle,
    Menubar,
    MenubarCheckboxItem,
    MenubarContent,
    MenubarItem,
    MenubarMenu,
    MenubarRadioGroup,
    MenubarRadioItem,
    MenubarSeparator,
    MenubarShortcut,
    MenubarSub,
    MenubarSubContent,
    MenubarSubTrigger,
    MenubarTrigger
  },
  data()
  {
    return {
      saving: false,
      visible: false,
      loadingInfo: false,
      editor: null as unknown as string,
      changed: null as unknown as string,
      contentChanged: false,
      item: null as unknown as Document,
      identify: null as unknown as string
    }
  },
  created()
  {
    const router = useRouter()
    const params = router.currentRoute.value.params
    this.identify = params['identify'] as string
  },
  methods: {
    cn,
    changeType(value: string)
    {
      this.editor = value
      this.visible = true
    },
    changeContent(text: string)
    {
      if (this.item.content !== text) {
        this.contentChanged = true
      }
      this.item.content = text
    },
    onSuccess(value: Document)
    {
      this.item = value
      this.changed = Date.now()
                         .toString()
    },
    change(value: Document)
    {
      this.loadingInfo = true
      DocumentService.getByIdentify(value.identify as string)
                     .then(response => {
                       if (response.status && response.data) {
                         this.item = response.data
                         this.editor = response.data.editor
                         this.contentChanged = false
                       }
                     })
                     .finally(() => this.loadingInfo = false)
    },
    createDocument(value: { parent: Document, editor: string })
    {
      const { parent, editor } = value
      this.editor = editor
      this.item = parent
      this.visible = true
    },
    save()
    {
      const { id, name, content, editor, sorting, book, identify, parent } = this.item
      const payload = { id, name, content, editor, sorting, book, identify, parent }
      this.saving = true
      DocumentService.saveOrUpdate(payload)
                     .then((response) => {
                       if (response.status) {
                         toast(`更新文档 [ ${ payload.name } ] 成功`, { type: 'success' })
                         this.contentChanged = false
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

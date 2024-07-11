<template>
  <Card class="w-full rounded-sm border-0 shadow-background">
    <CardHeader class="p-0 space-y-1.5">
      <CardTitle class="space-x-4 flex items-center">
        <Menubar class="border-0 shadow-none w-full bg-gray-100 rounded-none pl-3">
          <MenubarMenu>
            <MenubarTrigger class="cursor-pointer hover:bg-blue-100">文件</MenubarTrigger>
            <MenubarContent>
              <MenubarItem class="cursor-pointer" @click="changeType('Txt')">
                基础文本
                <MenubarShortcut>⌘T</MenubarShortcut>
              </MenubarItem>
              <MenubarItem class="cursor-pointer" @click="changeType('Markdown')">
                Markdown
                <MenubarShortcut>⌘N</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </CardTitle>
    </CardHeader>
    <CardContent class="p-0 space-y-6">
      <div class="flex flex-col lg:flex-row">
        <div class="w-[200px] overflow-x-auto overflow-y-auto h-screen" :style="{ height: 'calc(100vh - 36px)' }">
          <BookCatalog :item="item" :changed="changed" @change="change"/>
        </div>
        <div class="flex-1">
          <MarkdownEditor v-if="editor === 'Markdown' && item" :content="item.content ? item.content : ''" :style="{ height: 'calc(100vh - 36px)' }" @change="changeContent"/>
        </div>
      </div>
    </CardContent>
  </Card>
  <BookTitle v-if="visible" :is-visible="visible" :editor="editor" @close="visible = $event" @onSuccess="onSuccess"/>
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
import BookTitle from '@/views/pages/book/components/BookTitle.vue'
import { Document } from '@/model/document.ts'
import { cloneDeep } from 'lodash'

export default defineComponent({
  name: 'BookWriter',
  components: {
    BookTitle,
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
      visible: false,
      editor: null as unknown as string,
      changed: null as unknown as string,
      item: null as unknown as Document
    }
  },
  methods: {
    changeType(value: string)
    {
      this.editor = value
      this.visible = true
    },
    changeContent(text: string)
    {
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
      this.item = cloneDeep(value)
      this.editor = value.editor as string
    }
  }
})
</script>

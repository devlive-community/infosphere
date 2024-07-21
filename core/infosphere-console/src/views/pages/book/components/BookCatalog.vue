<template>
  <ScrollArea class="rounded-none border w-full h-full whitespace-nowrap">
    <div class="flex-1 flex flex-col pt-2 pb-2">
      <InfoSphereLoading v-if="loading" :show="loading"/>
      <TransitionGroup v-else name="list" appear>
        <DefaultTree :items="items" :selectedKey="selectItem" @select-item="change">
          <template #node="{ node }">
            <ContextMenu @update:open="selectItem = node">
              <ContextMenuTrigger class="text-xs text-gray-500">
                <div class="flex w-full flex-col pt-2 pb-2" :key="node.identify">
                  <div class="flex items-center">
                    <div class="flex items-center">
                      <div class="font-semibold">
                        {{ node.name }}
                      </div>
                      <span class="text-xs text-muted-foreground ml-1">({{ node.identify }})</span>
                    </div>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent class="w-48">
                <ContextMenuSub>
                  <ContextMenuSubTrigger class="cursor-pointer">
                    <div class="flex items-center space-x-2">
                      <FileIcon :size="18"/>
                      <span>新建文档</span>
                    </div>
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent class="w-48">
                    <ContextMenuItem class="cursor-pointer" @click="createDocument(node, 'Markdown')">
                      Markdown
                      <ContextMenuShortcut>⇧⌘M</ContextMenuShortcut>
                    </ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuItem class="cursor-pointer" @click="editDocument(node)">
                  <div class="flex items-center space-x-2">
                    <PencilIcon :size="18"/>
                    <span>修改文档</span>
                  </div>
                  <ContextMenuShortcut>⇧⌘E</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator/>
                <ContextMenuItem class="cursor-pointer text-red-400 hover:text-red-700" @click="deleteDocument(node, true)">
                  <div class="flex items-center space-x-2">
                    <Trash2Icon :size="18"/>
                    <span>删除文档</span>
                  </div>
                  <ContextMenuShortcut class="text-red-400">⇧⌘D</ContextMenuShortcut>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </template>
        </DefaultTree>
      </TransitionGroup>
    </div>
    <ScrollBar orientation="horizontal"/>
  </ScrollArea>
  <DocumentDelete v-if="deleteVisible" :identify="identify as string" :is-visible="deleteVisible" @close="deleteDocument(null, $event)"/>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, watch } from 'vue'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils.ts'
import BookService from '@/service/book.ts'
import { useRouter } from 'vue-router'
import { Document } from '@/model/document.ts'
import InfoSphereLoading from '@/views/components/loading/InfoSphereLoading.vue'
import DefaultTree from '@/views/components/tree/DefaultTree.vue'
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { FileIcon, PencilIcon, Trash2Icon } from 'lucide-vue-next'
import DocumentDelete from '@/views/pages/book/components/DocumentDelete.vue'

export default defineComponent({
  name: 'BookCatalog',
  props: {
    item: {
      type: Object as () => Document,
      required: true
    },
    changed: {
      type: String
    }
  },
  components: {
    DocumentDelete,
    DefaultTree,
    InfoSphereLoading,
    ScrollBar, ScrollArea,
    ContextMenu,
    ContextMenuCheckboxItem,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuRadioGroup,
    ContextMenuRadioItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
    FileIcon, Trash2Icon, PencilIcon
  },
  emits: ['change', 'create-document', 'edit-document'],
  setup(props, { emit })
  {
    const loading = ref(false)
    const items = ref<Document[]>([])
    const selectItem = ref<Document>(props.item)
    const router = useRouter()
    const identify = ref<string | null>(null)
    const deleteVisible = ref(false)

    const initialize = () => {
      const params = router.currentRoute.value.params
      const bookIdentify = params['identify'] as string
      const documentIdentify = params['documentIdentify'] as string
      identify.value = bookIdentify

      if (bookIdentify) {
        loading.value = true
        BookService.getCatalogByBook(bookIdentify)
                   .then(response => {
                     items.value = response.data
                     if (documentIdentify) {
                       selectItem.value = getAllNodes(items.value)
                           .find(item => item.identify === documentIdentify) as any
                       emit('change', selectItem.value)
                     }
                   })
                   .finally(() => loading.value = false)
      }
    }

    const getAllNodes = (nodes: Document[]): Document[] => {
      const result: Document[] = []

      function traverse(node: Document)
      {
        result.push(node)
        if (node.children) {
          node.children.forEach(child => traverse(child))
        }
      }

      nodes.forEach(node => traverse(node))
      return result
    }

    const change = (value: any) => {
      selectItem.value = value
      router.push(`/book/writer/${ identify.value }/${ value.identify }`)
      emit('change', value)
    }

    const createDocument = (value: Document, editor: string) => {
      const emitValue = { parent: value, editor: editor }
      emit('create-document', emitValue)
    }

    const editDocument = (value: Document) => {
      emit('edit-document', value)
    }

    const deleteDocument = (value: Document | null, visible: boolean) => {
      if (value) {
        identify.value = value.identify as string
      }
      deleteVisible.value = visible
      initialize()
    }

    watch(() => props.changed, () => {
      selectItem.value = props.item
      initialize()
    }, { immediate: true })

    onMounted(() => {
      initialize()
    })

    return {
      loading,
      items,
      selectItem,
      identify,
      deleteVisible,
      cn,
      change,
      createDocument,
      editDocument,
      deleteDocument
    }
  }
})
</script>

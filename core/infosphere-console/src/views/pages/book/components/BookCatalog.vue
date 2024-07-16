<template>
  <ScrollArea class="rounded-none border w-full h-full whitespace-nowrap">
    <div class="flex-1 flex flex-col pt-2 pb-2">
      <InfoSphereLoading v-if="loading" :show="loading"/>
      <TransitionGroup v-else name="list" appear>
        <DefaultTree :items="items" :selectedKey="selectItem" @select-item="change">
          <template #node="{ node }">
            <ContextMenu @update:open="selectItem.identify = node.identify">
              <ContextMenuTrigger class="text-xs text-gray-500">
                <div class="flex w-full flex-col pt-2 pb-2">
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
              <ContextMenuContent>
                <ContextMenuItem>Title: {{ node.name }}</ContextMenuItem>
                <ContextMenuItem>Key: {{ node.identify }}</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </template>
        </DefaultTree>
      </TransitionGroup>
    </div>
    <ScrollBar orientation="horizontal"/>
  </ScrollArea>
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
    ContextMenuTrigger
  },
  setup(props, { emit })
  {
    const loading = ref(false)
    const items = ref<Document[]>([])
    const selectItem = ref<Document>(props.item)
    const router = useRouter()

    const initialize = () => {
      const params = router.currentRoute.value.params
      const identify = params['identify'] as string

      if (identify) {
        loading.value = true
        BookService.getCatalogByBook(identify)
                   .then(response => {
                     items.value = response.data
                   })
                   .finally(() => loading.value = false)
      }
    }

    const change = (value: any) => {
      selectItem.value = value
      emit('change', value)
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
      cn,
      change
    }
  }
})
</script>

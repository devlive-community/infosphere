<template>
  <ScrollArea class="rounded-none border w-full h-full whitespace-nowrap border-t-0">
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
                    </div>
                  </div>
                </div>
              </ContextMenuTrigger>
            </ContextMenu>
          </template>
        </DefaultTree>
      </TransitionGroup>
    </div>
    <ScrollBar orientation="horizontal"/>
  </ScrollArea>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils.ts'
import { useRouter } from 'vue-router'
import { Document } from '@/model/document.ts'
import InfoSphereLoading from '@/views/components/loading/InfoSphereLoading.vue'
import BookService from '@/service/book.ts'
import DefaultTree from '@/views/components/tree/DefaultTree.vue'
import { ContextMenu } from '@/components/ui/context-menu'

export default defineComponent({
  name: 'BookSidebar',
  props: {
    item: {
      type: Object as () => Document,
      required: true
    }
  },
  components: {
    ContextMenu,
    DefaultTree,
    InfoSphereLoading,
    ScrollBar, ScrollArea
  },
  setup(props, { emit })
  {
    const loading = ref(false)
    const items = ref<Document[]>([])
    const selectItem = ref<Document>(props.item)

    const initialize = () => {
      const router = useRouter()
      const params = router.currentRoute.value.params
      const identify = params['bookIdentify'] as string
      const documentIdentify = params['documentIdentify'] as string
      if (identify) {
        loading.value = true
        BookService.getCatalogByBook(identify)
                   .then(response => {
                     items.value = response.data
                     if (documentIdentify) {
                       selectItem.value = items.value.find(item => item.identify === documentIdentify) as any
                       emit('change', documentIdentify)
                     }
                     else if (items.value.length > 0) {
                       const fistItem = items.value[0]
                       selectItem.value = fistItem
                       emit('change', fistItem.identify)
                     }
                   })
                   .finally(() => loading.value = false)
      }
    }

    const change = (value: Document) => {
      selectItem.value = value
      emit('change', value.identify)
    }

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

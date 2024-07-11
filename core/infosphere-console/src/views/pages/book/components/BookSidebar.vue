<template>
  <ScrollArea class="rounded-none border w-full h-full whitespace-nowrap border-t-0">
    <div class="flex-1 flex flex-col pt-2 pb-2">
      <InfoSphereLoading v-if="loading" :show="loading"/>
      <TransitionGroup v-else name="list" appear>
        <button v-for="item of items" :key="item.identify"
                :class="cn(
            'flex flex-col items-start rounded-none text-left text-sm transition-all hover:bg-accent p-2',
                  selectItem?.identify === item.identify && 'bg-muted',
                 )" @click="change(item)">
          <div class="flex w-full flex-col">
            <div :class="cn('font-normal text-gray-500',
                            selectItem?.identify === item.identify && 'text-blue-400')">
              {{ item.name }}
            </div>
          </div>
        </button>
      </TransitionGroup>
    </div>
    <ScrollBar orientation="horizontal"/>
  </ScrollArea>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils.ts'
import DocumentService from '@/service/document.ts'
import { useRouter } from 'vue-router'
import { Document } from '@/model/document.ts'
import InfoSphereLoading from '@/views/components/loading/InfoSphereLoading.vue'

export default defineComponent({
  name: 'BookSidebar',
  props: {
    item: {
      type: Object as () => Document,
      required: true
    }
  },
  components: {
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
        DocumentService.getCatalogByBook(identify)
                       .then(response => {
                         items.value = response.data
                         if (documentIdentify) {
                           selectItem.value = items.value.find(item => item.identify === documentIdentify) as any
                           emit('change', documentIdentify)
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

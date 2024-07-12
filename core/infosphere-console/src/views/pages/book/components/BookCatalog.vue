<template>
  <ScrollArea class="rounded-none border w-full h-full whitespace-nowrap">
    <div class="flex-1 flex flex-col pt-2 pb-2">
      <InfoSphereLoading v-if="loading" :show="loading"/>
      <TransitionGroup v-else name="list" appear>
        <button v-for="item of items" :key="item.identify"
                :class="cn(
            'flex flex-col items-start rounded-none text-left text-sm transition-all hover:bg-accent p-2',
                  selectItem?.identify === item.identify && 'bg-muted',
                 )" @click="change(item)">
          <div class="flex w-full flex-col">
            <div class="flex items-center">
              <div class="flex items-center">
                <div class="font-semibold">
                  {{ item.name }}
                </div>
                <span class="text-xs text-muted-foreground ml-1">({{ item.identify }})</span>
              </div>
            </div>
          </div>
        </button>
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
    InfoSphereLoading,
    ScrollBar, ScrollArea
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

    const change = (value: Document) => {
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

<template>
  <div>
    <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-8 gap-4">
      <div v-for="item in items" :key="item.identify" class="flex flex-col items-center">
        <BookItem :item="item"/>
      </div>
    </div>
    <div v-if="pagination && items?.length > 0" class="mt-3">
      <Pagination v-slot="{ page }" :default-page="pagination.page" :items-per-page="pagination.size" :sibling-count="1" :total="pagination.total" show-edges
                  @update:page="changePage($event)">
        <PaginationList v-slot="{ items }" class="flex items-center gap-1">
          <PaginationFirst/>
          <PaginationPrev/>
          <template v-for="(item, index) in items">
            <PaginationListItem v-if="item.type === 'page'" :key="index" :value="item.value" as-child>
              <Button :variant="item.value === page ? 'default' : 'outline'" class="w-10 h-10 p-0">
                {{ item.value }}
              </Button>
            </PaginationListItem>
            <PaginationEllipsis v-else :key="item.type" :index="index"/>
          </template>
          <PaginationNext/>
          <PaginationLast/>
        </PaginationList>
      </Pagination>
    </div>
    <div v-else>
      <p class="text-muted-foreground m-6">暂无书籍。</p>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Pagination, PaginationEllipsis, PaginationFirst, PaginationLast, PaginationList, PaginationListItem, PaginationNext, PaginationPrev } from '@/components/ui/pagination'
import { Book } from '@/model/book.ts'
import { Button } from '@/components/ui/button'
import { Pagination as PaginationEntity } from '@/model/response.ts'
import { cloneDeep } from 'lodash'
import { ClockIcon, CogIcon, EyeIcon, FileTextIcon, LockIcon, LockOpenIcon, PencilIcon, UserIcon } from 'lucide-vue-next'
import { Separator } from '@/components/ui/separator'
import InfoSphereTooltip from '@/views/components/tooltip/InfoSphereTooltip.vue'
import BookItem from '@/views/components/item/BookItem.vue'

export default defineComponent({
  name: 'BookCoverPageable',
  components: {
    BookItem,
    InfoSphereTooltip,
    Separator,
    Button,
    CardContent, Card, CardDescription, CardFooter, CardHeader, CardTitle,
    Pagination, PaginationEllipsis, PaginationFirst, PaginationLast, PaginationList, PaginationListItem, PaginationNext, PaginationPrev,
    EyeIcon, LockOpenIcon, LockIcon, UserIcon, ClockIcon, PencilIcon, CogIcon, FileTextIcon
  },
  props: {
    items: {
      type: Array as PropType<Book[]>,
      required: true
    },
    pagination: {
      type: Object as PropType<PaginationEntity>,
      required: true
    }
  },
  methods: {
    changePage(value: number)
    {
      const pagination: PaginationEntity = cloneDeep(this.pagination) as PaginationEntity
      pagination.page = value
      this.$emit('changePage', pagination)
    }
  }
})
</script>

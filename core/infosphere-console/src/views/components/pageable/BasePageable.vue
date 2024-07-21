<template>
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
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { Pagination, PaginationEllipsis, PaginationFirst, PaginationLast, PaginationList, PaginationListItem, PaginationNext, PaginationPrev } from '@/components/ui/pagination'
import { Button } from '@/components/ui/button'
import { Pagination as PaginationEntity } from '@/model/response.ts'
import { cloneDeep } from 'lodash'

export default defineComponent({
  name: 'BasePageable',
  components: {
    Button,
    Pagination, PaginationEllipsis, PaginationFirst, PaginationLast, PaginationList, PaginationListItem, PaginationNext, PaginationPrev
  },
  props: {
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

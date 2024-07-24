<template>
  <div v-if="items?.length > 0" class="space-y-3">
    <div v-for="item in items">
      <BookWithCoverItem :item="item"/>
    </div>
    <BasePageable :pagination="pagination" @changePage="changePage"/>
  </div>
  <div v-else>
    <p class="text-muted-foreground m-6">暂无书籍。</p>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import BasePageable from '@/views/components/pageable/BasePageable.vue'
import { Pagination as PaginationEntity } from '@/model/response.ts'
import { Book } from '@/model/book.ts'
import BookWithCoverItem from '@/views/components/item/BookWithCoverItem.vue'

export default defineComponent({
  name: 'BookListWithCoverPageable',
  components: {
    BookWithCoverItem,
    BasePageable
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
    changePage(value: PaginationEntity)
    {
      this.$emit('changePage', value)
    }
  }
})
</script>

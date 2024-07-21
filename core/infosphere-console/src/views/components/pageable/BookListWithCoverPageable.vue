<template>
  <div class="space-y-3">
    <div v-for="item in items">
      <BookWithCoverItem :item="item"/>
    </div>
  </div>
  <BasePageable :pagination="pagination" @changePage="changePage"/>
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

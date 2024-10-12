<template>
  <div class="space-y-2">
    <RatingItem v-for="item in items" :item="item"/>
  </div>
  <div v-if="pagination && items?.length > 0" class="mt-3">
    <BasePageable :pagination="pagination" @changePage="changePage"/>
  </div>
  <div v-else>
    <p class="text-muted-foreground m-6">暂无评论。</p>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { Button } from '@/components/ui/button'
import { Pagination as PaginationEntity } from '@/model/response.ts'
import { Rating } from '@/model/rating.ts'
import BasePageable from '@/views/components/pageable/BasePageable.vue'
import RatingItem from '@/views/components/item/RatingItem.vue'

export default defineComponent({
  name: 'RatingPageable',
  components: {
    RatingItem,
    BasePageable,
    Button
  },
  props: {
    items: {
      type: Array as PropType<Rating[]>,
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

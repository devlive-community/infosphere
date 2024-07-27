<template>
  <div v-if="items?.length > 0">
    <div class="flex flex-wrap gap-5">
      <div v-for="item in items">
        <UserItem :item="item" @change="change"/>
      </div>
    </div>
    <BasePageable :pagination="pagination" @changePage="changePage"/>
  </div>
  <div v-else>
    <p class="text-muted-foreground m-6">暂无用户。</p>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { User } from '@/model/user.ts'
import { Pagination as PaginationEntity } from '@/model/response.ts'
import BasePageable from '@/views/components/pageable/BasePageable.vue'
import BookWithCoverItem from '@/views/components/item/BookWithCoverItem.vue'
import UserItem from '@/views/components/item/UserItem.vue'

export default defineComponent({
  name: 'UserPageable',
  components: { UserItem, BookWithCoverItem, BasePageable },
  props: {
    items: {
      type: Array as PropType<User[]>,
      required: true
    },
    pagination: {
      type: Object as () => PaginationEntity,
      required: true
    }
  },
  methods: {
    changePage(value: PaginationEntity)
    {
      this.$emit('changePage', value)
    },
    change()
    {
      this.$emit('change')
    }
  }
})
</script>

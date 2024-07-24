<template>
  <div class="space-x-1 space-y-1 flex flex-wrap items-center">
    <template v-for="item in items">
      <InfoSphereTooltip>
        <template #title>
          <Avatar>
            <AvatarImage :src="item.user?.avatar as string" :alt="item.user?.aliasName"/>
            <AvatarFallback>{{ splitName(item.user?.aliasName) }}</AvatarFallback>
          </Avatar>
        </template>
        <template #content>
          <div class="flex flex-col">
            <div class="flex items-center space-x-2">
              <span>{{ item.user?.username }}</span>
            </div>
            <div class="flex items-center space-x-1">
              <span>IP 地址：</span>
              <span>{{ item.address }}</span>
            </div>
            <div class="flex items-center space-x-1">
              <span>访问地址：</span>
              <span>{{ item.location }}</span>
            </div>
            <div class="flex items-center space-x-1">
              <span>访问时间：</span>
              <span>{{ item.createTime }}</span>
            </div>
          </div>
        </template>
      </InfoSphereTooltip>
    </template>
  </div>
  <div v-if="pagination && items?.length > 0" class="mt-3 ju">
    <Pagination v-slot="{ page }" :default-page="pagination.page" :items-per-page="pagination.size" :sibling-count="1" :total="pagination.total" show-edges
                @update:page="changePage($event)">
      <PaginationList v-slot="{ items }" class="flex items-center gap-1">
        <PaginationFirst/>
        <PaginationPrev/>
        <template v-for="(item, index) in items">
          <PaginationListItem v-if="item.type === 'page'" :key="index" :value="item.value" as-child>
            <Button :variant="item.value === page ? 'default' : 'outline'" class="w-9 h-9 p-0">
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
    <p class="text-muted-foreground m-6">暂无数据。</p>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Pagination as PaginationEntity } from '@/model/response.ts'
import { Access } from '@/model/access.ts'
import { Button } from '@/components/ui/button'
import { cloneDeep } from 'lodash'
import { Pagination, PaginationEllipsis, PaginationFirst, PaginationLast, PaginationList, PaginationListItem, PaginationNext, PaginationPrev } from '@/components/ui/pagination'
import InfoSphereTooltip from '@/views/components/tooltip/InfoSphereTooltip.vue'

export default defineComponent({
  name: 'AvatarPageable',
  props: {
    items: {
      type: Array as PropType<Access[]>,
      required: true
    },
    pagination: {
      type: Object as PropType<PaginationEntity>,
      required: true
    }
  },
  components: {
    InfoSphereTooltip,
    Button, Avatar, AvatarFallback, AvatarImage,
    Pagination, PaginationEllipsis, PaginationFirst, PaginationLast, PaginationList, PaginationListItem, PaginationNext, PaginationPrev
  },
  methods: {
    changePage(value: number)
    {
      const pagination: PaginationEntity = cloneDeep(this.pagination) as PaginationEntity
      pagination.page = value
      this.$emit('changePage', pagination)
    },
    splitName(name: string | undefined)
    {
      if (name) {
        const arr = name.split(' ')
        const initials = arr.map(word => word.charAt(0).toUpperCase())
        return initials.slice(0, 3)
                       .join('')
      }
      return 'N/A'
    }
  }
})
</script>

<template>
  <div class="space-y-3">
    <div v-for="item in items">
      <Card class="w-full rounded-sm shadow-background hover:bg-gray-50 cursor-pointer">
        <CardHeader class="p-3 space-y-1.5">
          <CardTitle>
            <RouterLink :to="`/book/info/${item.identify}`" class="flex items-center space-x-2 hover:text-blue-400">
              <LockOpenIcon v-if="item.visibility" class="w-5 h-5"/>
              <LockIcon v-else class="w-5 h-5"/>
              <span>{{ item.name }}</span>
            </RouterLink>
          </CardTitle>
          <CardDescription>
            <div class="flex h-5 items-center space-x-4 text-sm">
              <InfoSphereTooltip>
                <template #title>
                  <div class="flex items-center space-x-2">
                    <UserIcon class="w-4 h-4"/>
                    <span>{{ item.user?.username }}</span>
                  </div>
                </template>
                <template #content>
                  创建人
                </template>
              </InfoSphereTooltip>
              <Separator orientation="vertical"/>
              <InfoSphereTooltip>
                <template #title>
                  <div class="flex items-center space-x-2">
                    <FileTextIcon class="w-4 h-4"/>
                    <span>{{ item.documentCount }}</span>
                  </div>
                </template>
                <template #content>
                  文档数量
                </template>
              </InfoSphereTooltip>
              <Separator orientation="vertical"/>
              <InfoSphereTooltip>
                <template #title>
                  <div class="flex items-center space-x-2">
                    <ClockIcon class="w-4 h-4"/>
                    <span>{{ item.createTime }}</span>
                  </div>
                </template>
                <template #content>
                  创建时间
                </template>
              </InfoSphereTooltip>
              <Separator orientation="vertical"/>
              <InfoSphereTooltip>
                <template #title>
                  <div class="flex items-center space-x-2">
                    <PencilIcon class="w-3.5 h-3.5"/>
                    <span>{{ item.updateTime }}</span>
                  </div>
                </template>
                <template #content>
                  更新时间
                </template>
              </InfoSphereTooltip>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent class="p-3 pl-6 pr-6">
          <div class="grid items-center w-full gap-4">
            <div class="text-gray-400">
              {{ item.description ? item.description : '暂无描述' }}
            </div>
          </div>
        </CardContent>
        <CardFooter class="flex space-x-2 p-3">
          <div v-if="!isFollowed" class="space-x-2">
            <RouterLink :to="`/book/info/${item.identify}`">
              <Button variant="outline" class="space-x-2">
                <EyeIcon class="w-4 h-4"/>
                <span>查看书籍</span>
              </Button>
            </RouterLink>
            <RouterLink :to="`/book/setting/${item.identify}`">
              <Button variant="outline" class="space-x-2">
                <CogIcon class="w-4 h-4"/>
                <span>书籍设置</span>
              </Button>
            </RouterLink>
          </div>
        </CardFooter>
      </Card>
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

export default defineComponent({
  name: 'BookPageable',
  components: {
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
    },
    isFollowed: {
      type: Boolean,
      default: false
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

<template>
  <div class="flex flex-col space-y-8 lg:flex-row justify-center lg:space-x-12 lg:space-y-0 mt-5 min-h-[700px]">
    <div class="flex-1 max-w-7xl">
      <InfoSphereLoading v-if="loadingInfo" :show="loadingInfo" class="m-12"/>
      <Card v-else-if="info" class="w-full rounded-sm border-0 shadow-background">
        <CardHeader class="p-3 space-y-1.5">
          <CardTitle class="space-x-4 flex items-center">
            <span class="font-bold text-2xl">{{ info.name }}</span>
            <div class="flex space-x-2" v-if="info.user?.id === user?.id">
              <InfoSphereTooltip>
                <template #title>
                  <RouterLink :to="`/book/writer/${info.identify}`">
                    <SquarePenIcon class="w-4 h-4"/>
                  </RouterLink>
                </template>
                <template #content>
                  编辑文档
                </template>
              </InfoSphereTooltip>
              <InfoSphereTooltip>
                <template #title>
                  <RouterLink :to="`/book/setting/${info.identify}`">
                    <SettingsIcon class="w-4 h-4"/>
                  </RouterLink>
                </template>
                <template #content>
                  书籍设置
                </template>
              </InfoSphereTooltip>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent class="p-3 pl-6 pr-6 space-y-6">
          <div class="flex w-full">
            <div class="w-44 h-64">
              <AspectRatio class="w-full h-64">
                <img :src="info.cover ? info.cover : '/static/images/default-cover.png'" :alt="info.name" class="rounded-md w-full h-full border-2"/>
              </AspectRatio>
            </div>
            <div class="flex-1 pl-10 space-y-3">
              <div class="flex items-center space-x-6">
                <Label class="text-gray-400">书籍作者:</Label>
                <RouterLink :to="`/user/${info.user?.username}`" class="text-blue-400 hover:border-b hover:border-b-blue-400">
                  {{ info.user?.username }}
                </RouterLink>
              </div>
              <Separator class="bg-gray-100"/>
              <div class="flex items-center space-x-6">
                <Label class="text-gray-400">文档数量:</Label>
                <span>{{ info.documentCount }}</span>
              </div>
              <Separator class="bg-gray-100"/>
              <div class="flex items-center space-x-6">
                <Label class="text-gray-400">阅读人次:</Label>
                <span>{{ info.visitorCount }}</span>
              </div>
              <Separator class="bg-gray-100"/>
              <div class="flex items-center space-x-6">
                <Label class="text-gray-400">创建时间:</Label>
                <span>{{ info.createTime }}</span>
              </div>
              <Separator class="bg-gray-100"/>
              <div class="flex items-center space-x-6">
                <Label class="text-gray-400">更新时间:</Label>
                <span>{{ info.updateTime }}</span>
              </div>
              <Separator class="bg-gray-100"/>
            </div>
          </div>
          <div class="flex w-full">
            <div class="w-44"></div>
            <div class="flex-1 pl-10 space-x-3">
              <RouterLink :to="`/book/reader/${info.identify}`">
                <Button class="space-x-2">
                  <BookIcon class="w-4 h-4"/>
                  <span>立即阅读</span>
                </Button>
              </RouterLink>
              <Button v-if="loggedIn" :disabled="loadingFollow" class="space-x-2 bg-amber-400 hover:bg-amber-500" @click="follow">
                <Loader2Icon v-if="loadingFollow" class="w-4 h-4 animate-spin"/>
                <HeartOffIcon v-if="info.isFollowed && !loadingFollow" class="w-4 h-4"/>
                <HeartIcon v-else-if="!loadingFollow" class="w-4 h-4"/>
                <span>{{ info.isFollowed ? '取消关注' : '关注书籍' }}</span>
              </Button>
            </div>
          </div>
          <div class="grid items-center w-full gap-4">
            <Label class="-ml-5">书籍描述</Label>
            <div class="text-gray-400 p-4">
              {{ info.description ? info.description : '暂无描述' }}
            </div>
          </div>
        </CardContent>
      </Card>
      <InfoSphereSkeleton v-if="loadingCatalog" :show="loadingCatalog"/>
      <Tabs v-else-if="info" v-model="activeTab" :default-value="activeTab">
        <TabsList>
          <TabsTrigger value="content">书籍目录</TabsTrigger>
          <TabsTrigger v-if="loggedIn" value="access" @click="forwardAccess">访问记录</TabsTrigger>
        </TabsList>
        <TabsContent value="content" class="w-full">
          <div v-if="items?.length > 0" v-for="item in items" class="hover:bg-gray-100">
            <RouterLink :to="`/book/reader/${info.identify}/${item.identify}`">
              <div class="flex-1 p-2 cursor-pointer">
                <Label class="cursor-pointer font-normal text-gray-500">{{ item.name }}</Label>
              </div>
            </RouterLink>
            <Separator class="bg-gray-100"/>
          </div>
          <div v-else class="m-auto flex h-full w-full flex-col gap-2">
            <p class="text-muted-foreground m-6">暂无文档。</p>
          </div>
        </TabsContent>
        <TabsContent v-if="loggedIn" value="access" class="w-full">
          <InfoSphereSkeleton v-if="loadingAccess" :show="loadingAccess"/>
          <AvatarPageable v-else :pagination="pagination" :items="accessItems" @changePage="changePage"/>
        </TabsContent>
      </Tabs>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import InfoSphereTooltip from '@/views/components/tooltip/InfoSphereTooltip.vue'
import { Button } from '@/components/ui/button'
import { useRouter } from 'vue-router'
import BookService from '@/service/book'
import { Book } from '@/model/book.ts'
import InfoSphereLoading from '@/views/components/loading/InfoSphereLoading.vue'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { BookIcon, HeartIcon, HeartOffIcon, Loader2Icon, SettingsIcon, SquarePenIcon } from 'lucide-vue-next'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Document } from '@/model/document.ts'
import { TokenUtils } from '@/lib/token.ts'
import { Auth } from '@/model/user.ts'
import InfoSphereSkeleton from '@/views/components/skeleton/InfoSphereSkeleton.vue'
import { useUserStore } from '@/stores/user.ts'
import { Pagination } from '@/model/response.ts'
import { Access } from '@/model/access.ts'
import AvatarPageable from '@/views/components/pageable/AvatarPageable.vue'
import BookCoverPageable from '@/views/components/pageable/BookCoverPageable.vue'
import { Follow } from '@/model/follow.ts'
import FollowService from '@/service/follow.ts'
import { toast } from 'vue3-toastify'

export default defineComponent({
  name: 'BookInfo',
  components: {
    Loader2Icon,
    BookCoverPageable,
    AvatarPageable,
    InfoSphereSkeleton,
    Separator,
    Label,
    InfoSphereLoading,
    CardTitle, CardContent, CardHeader, Card,
    Button, InfoSphereTooltip,
    Tabs, TabsContent, TabsList, TabsTrigger,
    AspectRatio,
    SettingsIcon, SquarePenIcon, BookIcon, HeartIcon, HeartOffIcon
  },
  data()
  {
    return {
      loadingInfo: false,
      loadingCatalog: false,
      loadingAccess: false,
      loadingFollow: false,
      loggedIn: false,
      info: null as unknown as Book,
      items: [] as Document[],
      accessItems: [] as Access[],
      user: null as unknown as Auth,
      activeTab: 'content',
      identify: null as unknown as string,
      pagination: null as unknown as Pagination
    }
  },
  created()
  {
    this.user = TokenUtils.getAuthUser() as Auth
    const userStore = useUserStore()
    this.loggedIn = userStore.isLogin
    this.pagination = { page: 1, size: 203 }
    this.initialize()
  },
  methods: {
    initialize()
    {
      const router = useRouter()
      const params = router.currentRoute.value.params
      const identify = params['identify'] as string

      if (identify) {
        this.identify = identify
        this.loadingInfo = true
        this.loadingCatalog = true
        BookService.getByIdentify(identify)
                   .then(response => this.info = response.data)
                   .finally(() => this.loadingInfo = false)
        // 获取书籍目录
        BookService.getCatalogByBook(identify)
                   .then(response => this.items = response.data)
                   .finally(() => this.loadingCatalog = false)
        // 设置数据访问数据
        BookService.access(identify)
                   .then(response => console.log(`记录访问量：${ response.data?.id }`))
      }
    },
    forwardAccess()
    {
      this.loadingAccess = true
      BookService.getAllAccessByBook(this.identify, this.pagination)
                 .then(response => {
                   if (response.status && response.data) {
                     this.accessItems = response.data.content
                     this.pagination = response.data.page
                   }
                 })
                 .finally(() => this.loadingAccess = false)
    },
    changePage(value: Pagination)
    {
      this.pagination = value
      this.forwardAccess()
    },
    follow()
    {
      const configure: Follow = {
        identify: this.info.identify,
        type: 'BOOK'
      }
      this.loadingFollow = true
      if (this.info.isFollowed) {
        FollowService.delete(configure)
                     .then(response => {
                       if (response.status) {
                         toast(`取消关注书籍 [ ${ this.info.name } ] 成功`, { type: 'success' })
                         this.info.isFollowed = false
                       }
                       else {
                         toast(response.message as string, { type: 'error' })
                       }
                     })
                     .finally(() => this.loadingFollow = false)
      }
      else {
        FollowService.saveOrUpdate(configure)
                     .then((response) => {
                       if (response.status) {
                         toast(`关注书籍 [ ${ this.info.name } ] 成功`, { type: 'success' })
                         this.info.isFollowed = true
                       }
                       else {
                         toast(response.message as string, { type: 'error' })
                       }
                     })
                     .finally(() => this.loadingFollow = false)
      }
    }
  }
})
</script>

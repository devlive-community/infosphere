<template>
  <div>
    <LayoutHeader/>
    <div class="flex flex-row space-x-3 justify-center mt-5 min-h-[700px] px-3">
      <div class="flex-1 max-w-7xl">
        <InfoSphereLoading v-if="loading" :show="loading" class="m-12"/>
        <InfoSphereCard v-else-if="info" class="w-full rounded-sm border-0 shadow-background">
          <template #title>
            <div class="space-x-4 flex items-center">
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
            </div>
          </template>
          <div class="p-3 pl-6 pr-6 space-y-6">
            <div class="flex w-full">
              <div class="w-44 h-64">
                <AspectRatio class="w-full h-64">
                  <img :src="info.cover ? info.cover : '/static/images/default-cover.png'" :alt="info.name" class="rounded-md w-full h-full border-2"/>
                </AspectRatio>
              </div>
              <div class="flex-1 pl-10 space-y-2.5">
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
                  <Label class="text-gray-400">书籍来源:</Label>
                  <div v-if="info.originate">
                    <a :href="info.originate.value" target="_blank" class="text-sm text-blue-400 hover:border-b hover:border-b-blue-400">{{ info.originate.field }}</a>
                  </div>
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
          </div>
        </InfoSphereCard>
        <MenuSidebar/>
      </div>
    </div>
    <LayoutFooter/>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import LayoutHeader from '@/views/layouts/basic/components/LayoutHeader.vue'
import LayoutFooter from '@/views/layouts/basic/components/LayoutFooter.vue'
import InfoSphereLoading from '@/views/components/loading/InfoSphereLoading.vue'
import InfoSphereCard from '@/views/components/card/InfoSphereCard.vue'
import BookService from '@/service/book.ts'
import { Book } from '@/model/book.ts'
import { BookIcon, HeartIcon, HeartOffIcon, Loader2Icon, SettingsIcon, SquarePenIcon } from 'lucide-vue-next'
import InfoSphereTooltip from '@/views/components/tooltip/InfoSphereTooltip.vue'
import { Auth } from '@/model/user.ts'
import { TokenUtils } from '@/lib/token.ts'
import { Button } from '@/components/ui/button'
import { useUserStore } from '@/stores/user.ts'
import { Follow } from '@/model/follow.ts'
import FollowService from '@/service/follow.ts'
import { toast } from 'vue3-toastify'
import { Label } from '@/components/ui/label'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Separator } from '@/components/ui/separator'
import { RouterUtils } from '@/lib/router.ts'
import MenuSidebar from '@/views/layouts/book/components/MenuSidebar.vue'

export default defineComponent({
  name: 'InfoContainer',
  components: {
    MenuSidebar,
    Separator,
    AspectRatio,
    Label,
    Loader2Icon,
    BookIcon,
    HeartOffIcon, Button,
    HeartIcon,
    InfoSphereTooltip,
    SettingsIcon, SquarePenIcon,
    InfoSphereCard,
    InfoSphereLoading,
    LayoutFooter, LayoutHeader
  },
  data()
  {
    return {
      loading: false,
      loggedIn: false,
      loadingFollow: false,
      identify: null as unknown as string,
      info: null as unknown as Book,
      user: null as unknown as Auth
    }
  },
  created()
  {
    this.initialize()
  },
  methods: {
    initialize()
    {
      const identify = RouterUtils.getParams('identify')
      this.user = TokenUtils.getAuthUser() as Auth
      const userStore = useUserStore()
      this.loggedIn = userStore.isLogin

      if (identify) {
        this.identify = identify
        this.loading = true
        BookService.getByIdentify(identify)
                   .then(response => {
                     if (response.status && response.data) {
                       this.info = response.data
                     }
                   })
                   .finally(() => this.loading = false)
        // 设置数据访问数据
        BookService.access(identify)
                   .then(response => console.log(`记录访问量：${ response.data?.id }`))
      }
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

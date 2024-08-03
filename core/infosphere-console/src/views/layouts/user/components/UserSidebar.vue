<template>
  <InfoSphereCard>
    <template #title>
      <div class="justify-center items-center text-center p-2.5 border-b">
        个人主页
      </div>
    </template>
    <div class="p-2">
      <InfoSphereSkeleton v-if="loading" :show="loading"/>
      <div v-else-if="info" class="flex flex-col items-center justify-center">
        <div class="h-24 w-24">
          <Avatar class="w-full h-full">
            <AvatarImage :src="info.avatar as string" :alt="info.username"/>
            <AvatarFallback>{{ info.username }}</AvatarFallback>
          </Avatar>
        </div>
        <div class="flex flex-row justify-center items-center space-x-2">
          <div class="text-lg font-bold">{{ info.aliasName }}</div>
          <div class="text-xs text-gray-400">(@{{ info.username }})</div>
        </div>
        <div class="space-x-2 my-3">
          <Button :disabled="loadingFollow" class="space-x-2 bg-green-500 hover:bg-green-600 text-white" @click="follow">
            <Loader2Icon v-if="loadingFollow" class="w-4 h-4 animate-spin"/>
            <HeartOffIcon v-if="info.isFollowed && !loadingFollow" class="w-4 h-4"/>
            <HeartIcon v-else-if="!loadingFollow" class="w-4 h-4"/>
            <span>{{ info.isFollowed ? '取消关注' : '关注作者' }}</span>
          </Button>
        </div>
        <Separator class="text-gray-300 my-3"/>
        <div class="text-gray-400 space-x-3">
          <span>加入 InfoSphere : </span>
          <span class="text-red-500">{{ calculateDaysBetweenDates(new Date(info.createTime as string), new Date()) }}</span>
          <span>天</span>
        </div>
      </div>
    </div>
  </InfoSphereCard>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import InfoSphereCard from '@/views/components/card/InfoSphereCard.vue'
import InfoSphereSkeleton from '@/views/components/skeleton/InfoSphereSkeleton.vue'
import UserService from '@/service/user.ts'
import { User } from '@/model/user.ts'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { calculateDaysBetweenDates } from '@/lib/date.ts'
import { Button } from '@/components/ui/button'
import { HeartIcon, HeartOffIcon, Loader2Icon } from 'lucide-vue-next'
import { Follow } from '@/model/follow.ts'
import FollowService from '@/service/follow.ts'
import { toast } from 'vue3-toastify'

export default defineComponent({
  name: 'UserSidebar',
  components: {
    HeartIcon,
    Loader2Icon, HeartOffIcon,
    Button,
    Separator,
    InfoSphereSkeleton, InfoSphereCard,
    Avatar, AvatarFallback, AvatarImage
  },
  data()
  {
    return {
      loading: false,
      loadingFollow: false,
      info: null as unknown as User
    }
  },
  watch: {
    '$route.params.username': 'initialize'
  },
  created()
  {
    this.initialize()
  },
  methods: {
    calculateDaysBetweenDates,
    initialize()
    {
      this.loading = true
      const username = this.$route.params.username
      if (username) {
        UserService.getByUsername(username as string)
                   .then(response => {
                     if (response.status) {
                       this.info = response.data
                     }
                   })
                   .catch(() => this.$router.push('/common/404'))
                   .finally(() => this.loading = false)
      }
      else {
        this.$router.push('/common/404')
      }
    },
    follow()
    {
      const configure: Follow = {
        identify: this.info.username,
        type: 'USER'
      }
      this.loadingFollow = true
      if (this.info.isFollowed) {
        FollowService.delete(configure)
                     .then(response => {
                       if (response.status) {
                         toast(`取消关注用户 [ ${ this.info.username } ] 成功`, { type: 'success' })
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
                         toast(`关注用户 [ ${ this.info.username } ] 成功`, { type: 'success' })
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
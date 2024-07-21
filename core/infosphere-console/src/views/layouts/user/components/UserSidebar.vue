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
        <Separator class="text-gray-300 my-2"/>
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

export default defineComponent({
  name: 'UserSidebar',
  components: {
    Separator,
    InfoSphereSkeleton, InfoSphereCard,
    Avatar, AvatarFallback, AvatarImage
  },
  data()
  {
    return {
      loading: false,
      info: null as unknown as User
    }
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
    }
  }
})
</script>
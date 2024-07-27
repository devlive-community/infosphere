<template>
  <InfoSphereCard v-if="item" class="p-2 border-0">
    <div class="space-y-2">
      <div class="w-20 h-20">
        <Avatar class="w-full h-full">
          <AvatarImage :src="item.avatar as string" :alt="item.aliasName"/>
          <AvatarFallback>{{ splitName(item.aliasName) }}</AvatarFallback>
        </Avatar>
      </div>
      <div class="text-sm text-center text-gray-500">{{ item.username }}</div>
      <div class="flex justify-center">
        <Button class="bg-green-400 hover:bg-green-500 space-x-1" size="sm" @click="follow">
          <Loader2Icon v-if="loadingFollow" class="w-4 h-4 animate-spin"/>
          <HeartOffIcon v-if="item.isFollowed && !loadingFollow" class="w-4 h-4"/>
          <HeartIcon v-else-if="!loadingFollow" class="w-4 h-4"/>
          <span>{{ item.isFollowed ? '取消关注' : '关注作者' }}</span>
        </Button>
      </div>
    </div>
  </InfoSphereCard>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'
import { User } from '@/model/user.ts'
import InfoSphereCard from '@/views/components/card/InfoSphereCard.vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { HeartIcon, HeartOffIcon, Loader2Icon } from 'lucide-vue-next'
import { Follow } from '@/model/follow.ts'
import FollowService from '@/service/follow.ts'
import { toast } from 'vue3-toastify'
import { useUserStore } from '@/stores/user.ts'
import router from '@/router'

export default defineComponent({
  name: 'UserItem',
  components: {
    Button,
    Avatar, AvatarFallback, AvatarImage,
    InfoSphereCard,
    HeartIcon, Loader2Icon, HeartOffIcon
  },
  props: {
    item: {
      type: Object as () => User,
      required: true
    }
  },
  setup(props, { emit })
  {
    const userStore = useUserStore()
    const user = ref(userStore.info)
    const loadingFollow = ref(false)

    const username = router.currentRoute.value.params['username'] as string
    if (username === user.value?.username) {
      props.item.isFollowed = true
    }

    const splitName = (name: string | undefined) => {
      if (name) {
        const arr = name.split(' ')
        const initials = arr.map(word => word.charAt(0).toUpperCase())
        return initials.slice(0, 3)
                       .join('')
      }
      return 'N/A'
    }

    const follow = () => {
      const configure: Follow = {
        identify: props.item.username,
        type: 'USER'
      }
      loadingFollow.value = true
      if (props.item.isFollowed) {
        FollowService.delete(configure)
                     .then(response => {
                       if (response.status) {
                         toast(`取消关注用户 [ ${ props.item.username } ] 成功`, { type: 'success' })
                         props.item.isFollowed = false
                         emit('change')
                       }
                       else {
                         toast(response.message as string, { type: 'error' })
                       }
                     })
                     .finally(() => loadingFollow.value = false)
      }
      else {
        FollowService.saveOrUpdate(configure)
                     .then((response) => {
                       if (response.status) {
                         toast(`关注用户 [ ${ props.item.username } ] 成功`, { type: 'success' })
                         props.item.isFollowed = true
                       }
                       else {
                         toast(response.message as string, { type: 'error' })
                       }
                     })
                     .finally(() => loadingFollow.value = false)
      }
    }

    return {
      splitName,
      follow,
      loadingFollow
    }
  }
})
</script>

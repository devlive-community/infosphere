<template>
  <div class="flex space-x-2">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button size="icon" class="rounded-full border-0 hover:bg-transparent hover:text-sky-500 shadow-background" variant="outline">
          <CirclePlusIcon :size="25"/>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent class="w-30 mr-4 text-center">
        <RouterLink to="/book/setting">
          <DropdownMenuItem class="cursor-pointer">
            <span>创建书籍</span>
          </DropdownMenuItem>
        </RouterLink>
      </DropdownMenuContent>
    </DropdownMenu>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button size="icon" class="rounded-full" variant="outline">
          <Loader2Icon v-if="loading" class="w-5 h-5 animate-spin"/>
          <span v-else>{{ info?.username?.substring(0, 2) }}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent v-if="!loading && info" class="w-56 mr-4">
        <DropdownMenuLabel class="font-normal">
          <div class="flex flex-col space-y-1">
            <p class="text-sm font-medium leading-none">{{ info.username }}</p>
            <p class="text-xs leading-none text-muted-foreground">{{ info.email }}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator/>
        <RouterLink to="/book">
          <DropdownMenuItem class="cursor-pointer">
            <span>我的书籍</span>
            <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
          </DropdownMenuItem>
        </RouterLink>
        <RouterLink to="/setting">
          <DropdownMenuItem class="cursor-pointer">
            <span>个人设置</span>
            <DropdownMenuShortcut>⇧⌘S</DropdownMenuShortcut>
          </DropdownMenuItem>
        </RouterLink>
        <DropdownMenuSeparator/>
        <DropdownMenuItem class="cursor-pointer" @click="logout">
          <span>退出</span>
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import router from '@/router'
import { CirclePlusIcon, Loader2Icon } from 'lucide-vue-next'
import { useUserStore } from '@/stores/user.ts'

export default defineComponent({
  name: 'NavigationUser',
  components: {
    Button,
    Loader2Icon,
    CirclePlusIcon,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuPortal,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger
  },
  setup()
  {
    const userStore = useUserStore()
    const loading = ref(userStore.isLogin && !userStore.info)
    const info = ref(userStore.info)

    watch(() => userStore.info, (newInfo) => {
      loading.value = userStore.isLogin && !newInfo
      info.value = newInfo
    })

    onMounted(() => {
      if (userStore.isLogin) {
        userStore.fetchUserInfo()
                 .then(() => loading.value = false)
      }
    })

    const logout = () => {
      userStore.logout()
      router.push('/login')
    }

    return {
      info,
      loading,
      logout
    }
  }
})
</script>
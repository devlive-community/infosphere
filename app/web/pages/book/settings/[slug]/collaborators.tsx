import type { InferGetServerSidePropsType } from 'next'
import CollaboratorManager from '@/components/CollaboratorManager'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'

export const getServerSideProps = getBookSettingsProps

// 书籍设置 · 协作者：管理书籍的协作成员（仅可管理者）
export default function BookSettingsCollaborators({ book }: InferGetServerSidePropsType<typeof getBookSettingsProps>) {
  return (
    <BookSettingsLayout book={book} active="collaborators">
      <CollaboratorManager book={book} />
    </BookSettingsLayout>
  )
}

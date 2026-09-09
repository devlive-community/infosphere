import { api } from './api'

export type BackgroundTaskStatus = 'pending' | 'running' | 'retrying' | 'succeeded' | 'failed'

export interface BackgroundTask<TResult = unknown> {
  id: number
  type: string
  status: BackgroundTaskStatus
  attempts: number
  max_attempts: number
  last_error: string
  result?: TResult
}

export interface QueuedTask<TResult> {
  task: BackgroundTask<TResult>
  message: string
}

export function isQueuedTask<TResult>(value: TResult | QueuedTask<TResult>): value is QueuedTask<TResult> {
  return typeof value === 'object' && value !== null && 'task' in value
}

export async function waitForTask<TResult>(taskID: number, interval = 1500): Promise<TResult> {
  for (;;) {
    const task = await api<BackgroundTask<TResult>>(`/tasks/${taskID}`)
    if (task.status === 'succeeded' && task.result !== undefined) return task.result
    if (task.status === 'failed') throw new Error(task.last_error || '后台任务执行失败')
    await new Promise((resolve) => window.setTimeout(resolve, interval))
  }
}

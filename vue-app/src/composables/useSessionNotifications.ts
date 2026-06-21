import { notify } from '@/src/utils/notify'

export const useSessionNotifications = () => {
  const showSuccess = (msg: string) => notify.success(msg)
  const showWarning = (msg: string) => notify.warning(msg)
  const showError = (msg: string) => notify.error(msg)
  const showInfo = (msg: string) => notify.info(msg)

  return { showSuccess, showWarning, showError, showInfo }
}

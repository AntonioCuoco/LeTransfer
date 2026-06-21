import { message } from 'ant-design-vue'

export const useSessionNotifications = () => {
  const showSuccess = (msg: string) => message.success(msg)
  const showWarning = (msg: string) => message.warning(msg)
  const showError = (msg: string) => message.error(msg)
  const showInfo = (msg: string) => message.info(msg)

  return { showSuccess, showWarning, showError, showInfo }
}

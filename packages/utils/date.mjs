import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
export const transformUtcDateToLocalDate = (utcString) => {
  return dayjs.utc(utcString).local()
}

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

export const transformUtcDateToLocalDate = (utcString: string) => {
  return dayjs.utc(utcString).local()
}

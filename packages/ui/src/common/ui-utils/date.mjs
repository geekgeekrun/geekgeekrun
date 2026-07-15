import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
export const transformUtcDateToLocalDate = (value) => dayjs.utc(value).local()

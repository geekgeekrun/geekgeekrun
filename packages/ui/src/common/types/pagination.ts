export interface PageReq {
  pageNo: number
  pageSize: number
}
export interface PagedRes<T = unknown> {
  data: T[]
  pageNo: number
  totalItemCount: number
}

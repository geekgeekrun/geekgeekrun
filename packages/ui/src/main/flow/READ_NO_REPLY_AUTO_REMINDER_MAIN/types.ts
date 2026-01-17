enum GoldGeekStatus {
  WITHOUT = 0,
  WITH = 1
}
export enum MsgStatus {
  BOSS_MESSAGE_OR_SYSTEM_MESSAGE = 0,
  HAS_NOT_READ = 1,
  HAS_READ = 2,
  HAS_REVOKE = 3
}
enum TipType {
  EMPTY = 0
}

export interface ChatListItem {
  name: string
  avatar: string
  encryptBossId: string
  securityId: string
  encryptJobId: string
  brandName: string
  friendSource: number
  friendId: number
  uniqueId: `${ChatListItem['friendId']}-${number}`
  isTop: number // enum
  isFiltered: boolean
  relationType: number
  sourceTitle: string
  goldGeekStatus: GoldGeekStatus // enum
  lastText: string
  lastMessageId: string
  unreadCount: number
  lastMsgStatus: MsgStatus
  lastTS: number
  updateTime: number
  filterReasonList: null | unknown
  title: string
  tipType: TipType
  lastIsSelf: boolean
}

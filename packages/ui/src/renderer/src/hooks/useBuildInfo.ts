import _buildInfo from '../../../common/build-info.json'
import { shallowRef } from 'vue'

export default function useBuildInfo() {
  const buildInfo = shallowRef(JSON.parse(JSON.stringify(_buildInfo)))
  return {
    buildInfo
  }
}

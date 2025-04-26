import buildInfo from '../../../common/build-info.json'
import os from 'node:os'

type LowercaseLetter =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z'
type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
type Underscore = '_'

type ValidChar = LowercaseLetter | Digit | Underscore

type StartsWithLowercase<S extends string> = S extends `${LowercaseLetter}${string}` ? S : never
type EndsWithLowercaseOrDigit<S extends string> = S extends `${string}${LowercaseLetter | Digit}`
  ? S
  : never
type ContainsOnlyValidChars<S extends string> = S extends `${ValidChar}${infer Rest}`
  ? ContainsOnlyValidChars<Rest>
  : S extends ''
    ? S
    : never

type ValidString<S extends string> =
  StartsWithLowercase<S> extends never
    ? never
    : EndsWithLowercaseOrDigit<S> extends never
      ? never
      : ContainsOnlyValidChars<S> extends never
        ? never
        : S

function getCommonParams() {
  return {
    app_version: buildInfo.version,
    app_build_hash: buildInfo.buildHash,
    os_info: `${os.type()} | ${os.release()} | ${os.arch()}`,
    t: Number(new Date())
  }
}

export default async function gtag<T extends string>(
  name: ValidString<T>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any> = {}
) {
  params = {
    ...getCommonParams(),
    ...params
  }
  Object.keys(params).forEach((k) => {
    if ([null, undefined].includes(params[k])) {
      delete params[k]
    }
  })
  // ServiceWorker环境下直接调用上报函数
  const reporter = (await import('./Analytics')).default
  return reporter.fireEvent(name.replace(/-/g, '_'), params)
}

// Fire a page view event.
export function gtagPageView(
  page_title = document?.title ?? '',
  page_location = location.href,
  additionalParams = {}
) {
  return gtag('page_view', {
    page_location,
    page_title,
    ...getCommonParams(),
    ...additionalParams
  })
}

// Fire an error event.
export function gtagApplicationError(error: string, additionalParams = {}) {
  // Note: 'error' is a reserved event name and cannot be used
  // see https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference?client_type=gtag#reserved_names
  return gtag('application_error', {
    error,
    ...getCommonParams(),
    ...additionalParams
  })
}

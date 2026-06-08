import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

// 다운로드 페이지가 아닌 실제 APK 파일의 직접 URL
export const APK_DIRECT_URL = 'https://wellshare-logis.web.app/wellshare-narami.apk';

/**
 * 앱 내부에서 APK를 직접 다운로드하고 안드로이드 패키지 설치 화면을 띄운다(인앱 업데이트).
 * - onProgress(0~1): 다운로드 진행률.
 * - 설치는 OS 패키지 설치기가 처리. 최초 1회 "출처를 알 수 없는 앱 설치 허용" 동의가 필요할 수 있다.
 * - 실패 시 throw → 호출부에서 다운로드 페이지로 폴백.
 */
export async function downloadAndInstallApk(
  url: string,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  if (Platform.OS !== 'android') throw new Error('Android 전용 업데이트입니다.');

  const fileUri = (FileSystem.cacheDirectory || '') + 'wellshare-update.apk';
  try { await FileSystem.deleteAsync(fileUri, { idempotent: true }); } catch {}

  const dl = FileSystem.createDownloadResumable(
    url,
    fileUri,
    {},
    (p) => {
      if (onProgress && p.totalBytesExpectedToWrite > 0) {
        onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
      }
    },
  );

  const res = await dl.downloadAsync();
  if (!res?.uri) throw new Error('APK 다운로드에 실패했습니다.');

  // Android 7+ 는 file:// 직접 설치 불가 → FileProvider content:// URI 필요
  const contentUri = await FileSystem.getContentUriAsync(res.uri);

  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
}

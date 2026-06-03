import { registerRootComponent } from 'expo';
import App from './App';

// Expo 스탠드얼론 빌드에서 루트 컴포넌트를 AppRegistry에 등록한다.
// (이 등록이 없으면 standalone APK가 흰 화면/즉시 종료된다)
registerRootComponent(App);

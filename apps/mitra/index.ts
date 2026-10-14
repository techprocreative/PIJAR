import { registerRootComponent } from 'expo';

import App from './src/App';

// registerRootComponent memanggil AppRegistry.registerComponent('main', () => App);
// Ini memastikan lingkungan dev-client & Expo Go berperilaku konsisten.
registerRootComponent(App);

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import * as Cesium from 'cesium';

import './assets/css/main.css';

window.Cesium = Cesium;

const app = createApp(App);

app.use(createPinia());

app.mount('#app');

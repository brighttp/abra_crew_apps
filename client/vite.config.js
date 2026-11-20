import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwind from '@tailwindcss/vite';
export default defineConfig({plugins:[solid(),tailwind()],server:{proxy:{'/api':'http://127.0.0.1:3001'}},build:{target:'es2022'}});

import { defineConfig } from 'vite'  
import react from '@vitejs/plugin-react'

export default defineConfig({  
  plugins: [react()],  
  base: '/crypto-rpm/',  
  server: {  
    proxy: {  
      '/kalshi-api': {  
        target: 'https://external-api.kalshi.com',  
        changeOrigin: true,  
        rewrite: (path) => path.replace(/^\/kalshi-api/, '/trade-api/v2'),  
        secure: true,  
      },  
    },  
  },  
})  
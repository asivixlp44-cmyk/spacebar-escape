import { defineConfig } from 'vite';

export default defineConfig({
    // shared/ lives next to client/ and is imported by both client and server.
    // NO_HMR (the test runs): no hot reload, so an edit saved mid-run never reloads a page under test
    server: { fs: { allow: ['..'] }, port: 5621, hmr: process.env.NO_HMR ? false : undefined, watch: process.env.NO_HMR ? { ignored: ['**/*'] } : undefined },
    build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});

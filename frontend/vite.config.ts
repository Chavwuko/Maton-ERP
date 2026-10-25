/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Default 5000ms is comfortable per-file, but many files running their
    // jsdom+React+Mantine environments in parallel (the full-suite case)
    // can push a single async modal-open past it under CPU contention even
    // though the same test is instant in isolation.
    // The form-heavy tests (several Mantine selects and typed fields) take
    // 10-15s when the whole suite runs at once, and over 20s on a machine
    // that is short of memory, so leave generous headroom.
    testTimeout: 60000,
  },
})

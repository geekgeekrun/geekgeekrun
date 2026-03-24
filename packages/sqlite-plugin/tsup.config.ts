import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/handlers.ts',
    'src/enums.ts',
    'src/utils/*.ts',
    'src/entity/*.ts'
  ],
  format: ['esm', 'cjs'],
  outDir: 'dist',
  target: 'es2020',
  sourcemap: false,
  clean: true,
  dts: true,
  splitting: false,
  outExtension({ format }) {
    return { js: format === 'esm' ? '.js' : '.cjs' }
  },
  tsconfig: 'tsconfig.json'
})

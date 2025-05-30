import { join } from 'path'
import forms from '@tailwindcss/forms'
import typography from '@tailwindcss/typography'
import { skeleton } from '@skeletonlabs/tw-plugin'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './src/**/*.{html,js,svelte,ts}',
    join(require.resolve('@skeletonlabs/skeleton'), '../**/*.{html,js,svelte,ts}')
  ],
  theme: {
    extend: {
      colors: {
        cardBg: '#3D4380',
      }
    }
  },
  plugins: [
    forms,
    typography,
    skeleton({ themes: { preset: [{ name: 'skeleton', enhancements: true }] } })
  ]
}

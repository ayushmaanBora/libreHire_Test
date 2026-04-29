import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Libre-Hire',
  description: 'Ethical Developer Discovery Protocol',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* THE NUCLEAR BYPASS: Forces the browser to load Tailwind, ignoring your local configs */}
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>{children}</body>
    </html>
  )
}
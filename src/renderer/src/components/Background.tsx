import LeftBg from '@renderer/assets/gradients/docs-left.svg'
import RightBg from '@renderer/assets/gradients/docs-right.svg'
import React from 'react'
import { Image } from '@heroui/react'

const Background: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="relative">
      <main className="relative container mx-auto max-w-7xl z-10 min-h-[calc(100vh_-_64px_-_108px)] mb-12 flex-grow">
        {children}
      </main>

      <div
        aria-hidden="true"
        className="fixed hidden dark:md:block dark:opacity-100 -bottom-[30%] -left-[30%] z-0"
      >
        <Image removeWrapper alt="docs left background" src={LeftBg} />
      </div>

      <div
        aria-hidden="true"
        className="fixed hidden dark:md:block dark:opacity-70 -top-[50%] -right-[60%] 2xl:-top-[60%] 2xl:-right-[45%] z-0 rotate-12"
      >
        <Image removeWrapper alt="docs right background" src={RightBg} />
      </div>
    </div>
  )
}

export default Background

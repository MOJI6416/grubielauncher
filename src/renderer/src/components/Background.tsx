import React from 'react'

const Background: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),transparent_22rem)]" />
        <div
          className="absolute inset-0 opacity-[0.045]"
          style={{
            backgroundImage: `
              linear-gradient(to right, currentColor 1px, transparent 1px),
              linear-gradient(to bottom, currentColor 1px, transparent 1px)
            `,
            backgroundSize: `36px 36px`
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,rgba(0,0,0,0.5)_72%)]" />
      </div>

      <main
        className="
          relative z-10 w-full flex-grow
          min-h-[calc(100vh_-_64px_-_108px)] mb-12
          max-md:min-h-0 max-md:mb-0
        "
      >
        {children}
      </main>
    </div>
  )
}

export default Background

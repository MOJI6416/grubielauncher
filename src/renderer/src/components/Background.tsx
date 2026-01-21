import React from 'react'

const Background: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 hidden dark:block">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background: `
              radial-gradient(900px 520px at 18% 82%, rgba(59,130,246,0.14), transparent 58%),
              radial-gradient(860px 520px at 86% 18%, rgba(168,85,247,0.16), transparent 60%),
              radial-gradient(700px 420px at 65% 78%, rgba(34,197,94,0.08), transparent 62%)
            `
          }}
        />

        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(255,255,255,0.35) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.35) 1px, transparent 1px)
            `,
            backgroundSize: `44px 44px`
          }}
        />

        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.55)_100%)]" />
      </div>

      <main
        className="
          relative z-10 container mx-auto max-w-7xl flex-grow
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

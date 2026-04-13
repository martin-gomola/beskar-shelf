declare module 'epubjs' {
  interface EpubLocation {
    start?: {
      cfi?: string
      href?: string
    }
  }

  interface EpubRendition {
    themes: {
      default: (styles: Record<string, Record<string, string>>) => void
    }
    on: (event: string, callback: (location: EpubLocation) => void) => void
    display: (target?: string) => Promise<void>
    next: () => Promise<void>
    prev: () => Promise<void>
    destroy: () => void
  }

  interface EpubBook {
    renderTo: (target: Element, options: Record<string, unknown>) => EpubRendition
    ready: Promise<unknown>
    locations: {
      generate: (chars: number) => Promise<unknown>
      percentageFromCfi: (cfi: string) => number
    }
    destroy: () => void
  }

  const ePub: (input: string | ArrayBuffer) => EpubBook
  export default ePub
}

declare module 'foliate-js/view.js' {
  interface RelocateDetail {
    fraction: number
    cfi: string
    tocItem?: { label: string; href: string }
    pageItem?: { label: string }
    range?: Range
  }

  interface BookMetadata {
    title?: string
    author?: string | string[]
    language?: string
    [key: string]: unknown
  }

  interface TOCItem {
    label: string
    href: string
    subitems?: TOCItem[]
  }

  interface FoliateBook {
    metadata?: BookMetadata
    toc?: TOCItem[]
    sections: Array<{
      id: unknown
      linear?: string
      cfi?: string
      size?: number
      load(): string | Promise<string>
      unload?(): void
      createDocument?(): Document | Promise<Document>
    }>
    dir?: string
    rendition?: { layout?: string }
    resolveHref?(href: string): { index: number; anchor(doc: Document): Element | Range | null }
    resolveCFI?(cfi: string): { index: number; anchor(doc: Document): Element | Range | null }
    isExternal?(href: string): boolean
    splitTOCHref?(href: string): Promise<[unknown, unknown]> | [unknown, unknown]
    getTOCFragment?(doc: Document, id: unknown): Node
  }

  export class View extends HTMLElement {
    book: FoliateBook
    lastLocation: RelocateDetail | null
    isFixedLayout: boolean
    open(book: string | File | Blob | FoliateBook): Promise<void>
    close(): void
    init(opts: { lastLocation?: string | null; showTextStart?: boolean }): Promise<void>
    goTo(target: string | number): Promise<unknown>
    goToFraction(frac: number): Promise<void>
    prev(distance?: number): Promise<void>
    next(distance?: number): Promise<void>
    goLeft(): Promise<void>
    goRight(): Promise<void>
    getCFI(index: number, range?: Range): string
    renderer: HTMLElement & {
      setAttribute(name: string, value: string): void
      prev(distance?: number): Promise<void>
      next(distance?: number): Promise<void>
    }
  }

  export function makeBook(file: File | Blob | string): Promise<FoliateBook>
}

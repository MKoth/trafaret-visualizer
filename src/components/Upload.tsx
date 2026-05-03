import React, { useRef } from 'react'

type Props = {
  onLoadImages: (files: File[]) => void
}

export default function Upload({ onLoadImages }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    onLoadImages(files)
    // reset so the same files can be re-added if removed
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      <label style={{ display: 'block', marginBottom: 4 }}>Upload PNGs (with transparency)</label>
      <input ref={inputRef} type="file" accept="image/png" multiple onChange={handle} />
    </div>
  )
}

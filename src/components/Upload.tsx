import React from 'react'

type Props = {
  onLoadImage: (src: string) => void
}

export default function Upload({ onLoadImage }: Props) {
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    onLoadImage(URL.createObjectURL(f))
  }

  return (
    <div>
      <label>Upload PNG (with transparency)</label>
      <input type="file" accept="image/png" onChange={handle} />
    </div>
  )
}

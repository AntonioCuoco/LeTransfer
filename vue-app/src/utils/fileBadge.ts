/**
 * Etichetta mono a tre lettere per un file (ZIP / PDF / IMG …).
 * È la "targhetta" tipografica del design: niente icone dentro quadrati colorati,
 * il tipo di file è un dato e si scrive in mono. Usata sia in invio che in ricezione.
 */

export interface FileBadge {
  label: string
  color: string
}

const BY_EXTENSION: Record<string, FileBadge> = {
  zip: { label: 'ZIP', color: '#7c4dff' }, rar: { label: 'ZIP', color: '#7c4dff' }, '7z': { label: 'ZIP', color: '#7c4dff' }, gz: { label: 'ZIP', color: '#7c4dff' },
  pdf: { label: 'PDF', color: '#d64545' },
  mp4: { label: 'VID', color: '#e08a2b' }, mov: { label: 'VID', color: '#e08a2b' }, avi: { label: 'VID', color: '#e08a2b' }, mkv: { label: 'VID', color: '#e08a2b' },
  mp3: { label: 'AUD', color: '#e08a2b' }, wav: { label: 'AUD', color: '#e08a2b' }, flac: { label: 'AUD', color: '#e08a2b' },
  png: { label: 'IMG', color: '#12b89a' }, jpg: { label: 'IMG', color: '#12b89a' }, jpeg: { label: 'IMG', color: '#12b89a' }, svg: { label: 'IMG', color: '#12b89a' }, webp: { label: 'IMG', color: '#12b89a' }, gif: { label: 'IMG', color: '#12b89a' },
  doc: { label: 'DOC', color: '#2b74e0' }, docx: { label: 'DOC', color: '#2b74e0' }, txt: { label: 'TXT', color: '#2b74e0' }, md: { label: 'TXT', color: '#2b74e0' },
}

const BY_MIME_PREFIX: [string, FileBadge][] = [
  ['image/', { label: 'IMG', color: '#12b89a' }],
  ['video/', { label: 'VID', color: '#e08a2b' }],
  ['audio/', { label: 'AUD', color: '#e08a2b' }],
  ['text/', { label: 'TXT', color: '#2b74e0' }],
]

export function fileBadge(fileName: string, mimeType?: string): FileBadge {
  const extension = (fileName.split('.').pop() || '').toLowerCase()
  const byExtension = BY_EXTENSION[extension]
  if (byExtension) return byExtension

  if (mimeType) {
    const byMime = BY_MIME_PREFIX.find(([prefix]) => mimeType.startsWith(prefix))
    if (byMime) return byMime[1]
  }

  return { label: extension ? extension.slice(0, 3).toUpperCase() : 'FILE', color: '#7c4dff' }
}

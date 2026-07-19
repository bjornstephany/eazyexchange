import { describe, it, expect } from 'vitest'
import { segmentText } from '../linkify'

describe('segmentText', () => {
  it('returns a single text segment when there is no URL', () => {
    expect(segmentText('bonjour')).toEqual([{ type: 'text', value: 'bonjour' }])
  })

  it('splits a URL out of surrounding text', () => {
    expect(segmentText('carte https://maps.example/x ici')).toEqual([
      { type: 'text', value: 'carte ' },
      { type: 'url', value: 'https://maps.example/x' },
      { type: 'text', value: ' ici' },
    ])
  })

  it('handles a URL at the very start', () => {
    expect(segmentText('https://a.b/c suite')).toEqual([
      { type: 'url', value: 'https://a.b/c' },
      { type: 'text', value: ' suite' },
    ])
  })

  it('does not swallow a trailing period into the URL', () => {
    expect(segmentText('voir https://a.b/c.')).toEqual([
      { type: 'text', value: 'voir ' },
      { type: 'url', value: 'https://a.b/c' },
      { type: 'text', value: '.' },
    ])
  })

  it('preserves newlines in text segments', () => {
    expect(segmentText('ligne1\nligne2')).toEqual([{ type: 'text', value: 'ligne1\nligne2' }])
  })

  it('returns an empty array for an empty string', () => {
    expect(segmentText('')).toEqual([])
  })
})

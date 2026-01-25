import { describe, it, expect } from 'bun:test'
import {
  parseTimestamps,
  timeToSeconds,
  formatTimestamp,
  splitTextByTimestamps,
} from './timestamp-parser'

describe('timeToSeconds', () => {
  it('converts hours, minutes, seconds to total seconds', () => {
    expect(timeToSeconds(0, 0, 0)).toBe(0)
    expect(timeToSeconds(0, 1, 0)).toBe(60)
    expect(timeToSeconds(0, 56, 8)).toBe(3368)
    expect(timeToSeconds(1, 23, 45)).toBe(5025)
    expect(timeToSeconds(2, 0, 0)).toBe(7200)
  })
})

describe('formatTimestamp', () => {
  it('formats seconds as MM:SS for times under an hour', () => {
    expect(formatTimestamp(0)).toBe('0:00')
    expect(formatTimestamp(65)).toBe('1:05')
    expect(formatTimestamp(3368)).toBe('56:08')
  })

  it('formats seconds as HH:MM:SS for times over an hour', () => {
    expect(formatTimestamp(3600)).toBe('1:00:00')
    expect(formatTimestamp(5025)).toBe('1:23:45')
    expect(formatTimestamp(7265)).toBe('2:01:05')
  })
})

describe('parseTimestamps', () => {
  it('parses simple MM:SS timestamps', () => {
    const result = parseTimestamps('Check out 56:08 for more info')
    expect(result).toHaveLength(1)
    expect(result[0].startSeconds).toBe(3368)
    expect(result[0].originalText).toBe('56:08')
  })

  it('parses HH:MM:SS timestamps', () => {
    const result = parseTimestamps('At 1:23:45 he explains')
    expect(result).toHaveLength(1)
    expect(result[0].startSeconds).toBe(5025)
    expect(result[0].originalText).toBe('1:23:45')
  })

  it('parses timestamp ranges with dash', () => {
    const result = parseTimestamps('See 56:08-57:03 for details')
    expect(result).toHaveLength(1)
    expect(result[0].startSeconds).toBe(3368)
    expect(result[0].endSeconds).toBe(3423)
    expect(result[0].originalText).toBe('56:08-57:03')
  })

  it('parses timestamp ranges with en-dash', () => {
    const result = parseTimestamps('See 56:08–57:03 for details')
    expect(result).toHaveLength(1)
    expect(result[0].startSeconds).toBe(3368)
    expect(result[0].endSeconds).toBe(3423)
  })

  it('parses ok. prefixed timestamps', () => {
    const result = parseTimestamps('ok. 58:30 is when it starts')
    expect(result).toHaveLength(1)
    expect(result[0].startSeconds).toBe(3510)
    expect(result[0].originalText).toBe('ok. 58:30')
  })

  it('parses ok. prefixed timestamp ranges', () => {
    const result = parseTimestamps('(ok. 56:08–57:03) explains it')
    expect(result).toHaveLength(1)
    expect(result[0].startSeconds).toBe(3368)
    expect(result[0].endSeconds).toBe(3423)
  })

  it('parses multiple timestamps in text', () => {
    const result = parseTimestamps('Start at 10:00, then see 25:30 and 1:00:00')
    expect(result).toHaveLength(3)
    expect(result[0].startSeconds).toBe(600)
    expect(result[1].startSeconds).toBe(1530)
    expect(result[2].startSeconds).toBe(3600)
  })

  it('returns empty array for text without timestamps', () => {
    const result = parseTimestamps('No timestamps here')
    expect(result).toHaveLength(0)
  })

  it('captures correct start and end indices', () => {
    const text = 'See 56:08 for info'
    const result = parseTimestamps(text)
    expect(result[0].startIndex).toBe(4)
    expect(result[0].endIndex).toBe(9)
    expect(text.slice(result[0].startIndex, result[0].endIndex)).toBe('56:08')
  })
})

describe('splitTextByTimestamps', () => {
  it('returns single text segment for text without timestamps', () => {
    const result = splitTextByTimestamps('No timestamps here')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('text')
    expect(result[0].content).toBe('No timestamps here')
  })

  it('splits text with single timestamp', () => {
    const result = splitTextByTimestamps('Check 56:08 now')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ type: 'text', content: 'Check ' })
    expect(result[1].type).toBe('timestamp')
    expect(result[1].content).toBe('56:08')
    expect(result[1].timestamp?.startSeconds).toBe(3368)
    expect(result[2]).toEqual({ type: 'text', content: ' now' })
  })

  it('handles timestamp at start of text', () => {
    const result = splitTextByTimestamps('56:08 is the time')
    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('timestamp')
    expect(result[1]).toEqual({ type: 'text', content: ' is the time' })
  })

  it('handles timestamp at end of text', () => {
    const result = splitTextByTimestamps('Jump to 56:08')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ type: 'text', content: 'Jump to ' })
    expect(result[1].type).toBe('timestamp')
  })

  it('handles multiple timestamps', () => {
    const result = splitTextByTimestamps('See 10:00 and 20:00')
    expect(result).toHaveLength(4)
    expect(result[0]).toEqual({ type: 'text', content: 'See ' })
    expect(result[1].type).toBe('timestamp')
    expect(result[2]).toEqual({ type: 'text', content: ' and ' })
    expect(result[3].type).toBe('timestamp')
  })
})

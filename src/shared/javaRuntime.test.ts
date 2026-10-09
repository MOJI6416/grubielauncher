import { describe, expect, it } from 'vitest'
import {
  isAbsoluteJavaHome,
  javaFit,
  normalizeJavaDefaults,
  normalizeJavaOverride,
  sameJavaHome,
  sameJavaOverride,
  shortJavaVendor,
  stripJavaOverride
} from './javaRuntime'

describe('normalizeJavaOverride', () => {
  it('keeps a major version or an absolute home', () => {
    expect(normalizeJavaOverride({ major: 17 })).toEqual({ major: 17 })
    expect(normalizeJavaOverride({ home: 'C:\\Java\\zulu-21' })).toEqual({
      home: 'C:\\Java\\zulu-21'
    })
    expect(normalizeJavaOverride({ home: '/usr/lib/jvm/java-21' })).toEqual({
      home: '/usr/lib/jvm/java-21'
    })
  })

  it('drops anything a hand-edited or imported file could smuggle in', () => {
    expect(normalizeJavaOverride({ major: 17.5 })).toBeUndefined()
    expect(normalizeJavaOverride({ major: 1 })).toBeUndefined()
    expect(normalizeJavaOverride({ home: 'jdk/bin' })).toBeUndefined()
    expect(normalizeJavaOverride({ home: 'C:\\Java\0evil' })).toBeUndefined()
    expect(normalizeJavaOverride({ home: '' })).toBeUndefined()
    expect(normalizeJavaOverride('C:\\Java')).toBeUndefined()
    expect(normalizeJavaOverride(null)).toBeUndefined()
  })
})

describe('isAbsoluteJavaHome', () => {
  it('accepts drive, UNC and posix paths only', () => {
    expect(isAbsoluteJavaHome('D:/jdk')).toBe(true)
    expect(isAbsoluteJavaHome('\\\\server\\share\\jdk')).toBe(true)
    expect(isAbsoluteJavaHome('/opt/jdk')).toBe(true)
    expect(isAbsoluteJavaHome('..\\jdk')).toBe(false)
    expect(isAbsoluteJavaHome('C:jdk')).toBe(false)
    expect(isAbsoluteJavaHome('/opt/jdk\nrm')).toBe(false)
  })
})

describe('sameJavaOverride', () => {
  it('compares by value', () => {
    expect(sameJavaOverride(undefined, undefined)).toBe(true)
    expect(sameJavaOverride({ major: 17 }, { major: 17 })).toBe(true)
    expect(sameJavaOverride({ major: 17 }, { major: 21 })).toBe(false)
    expect(sameJavaOverride({ home: '/a' }, { home: '/a' })).toBe(true)
    expect(sameJavaOverride({ home: '/a' }, { major: 17 })).toBe(false)
    expect(sameJavaOverride({ major: 17 }, undefined)).toBe(false)
  })
})

describe('sameJavaHome', () => {
  it('ignores slashes and drive letter case on Windows paths', () => {
    expect(sameJavaHome('C:\\Java\\jdk\\', 'c:/java/jdk')).toBe(true)
    expect(sameJavaHome('/opt/JDK', '/opt/jdk')).toBe(false)
  })
})

describe('normalizeJavaDefaults', () => {
  it('keeps only major keys with absolute homes', () => {
    expect(
      normalizeJavaDefaults({
        '21': 'C:\\zulu21',
        '017': 'C:\\x',
        abc: '/opt/jdk',
        '8': 'relative',
        '17': '/usr/lib/jvm/17'
      })
    ).toEqual({ '21': 'C:\\zulu21', '17': '/usr/lib/jvm/17' })
  })
})

describe('javaFit', () => {
  it('rates a Java against the one the version needs', () => {
    expect(javaFit(21, 21)).toBe('recommended')
    expect(javaFit(17, 21)).toBe('newer')
    expect(javaFit(21, 17)).toBe('too_old')
    expect(javaFit(8, 17)).toBe('legacy_risk')
  })
})

describe('shortJavaVendor', () => {
  it('names the distribution players know', () => {
    expect(shortJavaVendor('Temurin-21.0.5+11', 'Eclipse Adoptium')).toBe('Temurin')
    expect(shortJavaVendor('Zulu21.38+21-CA', 'Azul Systems, Inc.')).toBe('Zulu')
    expect(shortJavaVendor('GraalVM CE 21.0.2+13.1', 'GraalVM Community')).toBe('GraalVM')
    expect(shortJavaVendor(undefined, 'Amazon.com Inc.')).toBe('Corretto')
    expect(shortJavaVendor(undefined, 'Oracle Corporation')).toBe('Oracle')
    expect(shortJavaVendor(undefined, 'Acme Runtime Co')).toBe('Acme')
    expect(shortJavaVendor(undefined, null)).toBeNull()
  })
})

describe('stripJavaOverride', () => {
  it('removes only the Java choice', () => {
    expect(stripJavaOverride({ name: 'a', overrides: { xmx: 4096, java: { major: 8 } } })).toEqual({
      name: 'a',
      overrides: { xmx: 4096 }
    })
    expect(stripJavaOverride({ name: 'a', overrides: { java: { home: '/opt/jdk' } } })).toEqual({
      name: 'a',
      overrides: undefined
    })
    const untouched = { name: 'a', overrides: { xmx: 4096 } }
    expect(stripJavaOverride(untouched)).toBe(untouched)
  })
})

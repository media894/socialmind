import { useMemo } from 'react'

const DATA_CODEWORDS = { 1: 19, 2: 34, 3: 55, 4: 80, 5: 108 }
const EC_CODEWORDS = { 1: 7, 2: 10, 3: 15, 4: 20, 5: 26 }
const BYTE_CAPACITY = { 1: 17, 2: 32, 3: 53, 4: 78, 5: 106 }
const ALIGNMENT_POSITION = { 2: 18, 3: 22, 4: 26, 5: 30 }

const EXP = new Array(512)
const LOG = new Array(256)
let value = 1
for (let i = 0; i < 255; i += 1) {
  EXP[i] = value
  LOG[value] = i
  value <<= 1
  if (value & 0x100) value ^= 0x11d
}
for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0
  return EXP[LOG[a] + LOG[b]]
}

function generatorPolynomial(degree) {
  let poly = [1]
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j]
      next[j + 1] ^= gfMul(poly[j], EXP[i])
    }
    poly = next
  }
  return poly
}

function reedSolomon(data, degree) {
  const gen = generatorPolynomial(degree)
  const result = new Array(degree).fill(0)

  data.forEach(byte => {
    const factor = byte ^ result[0]
    result.shift()
    result.push(0)
    for (let i = 0; i < degree; i += 1) {
      result[i] ^= gfMul(gen[i + 1], factor)
    }
  })

  return result
}

function bitsFromNumber(number, length) {
  const bits = []
  for (let i = length - 1; i >= 0; i -= 1) bits.push((number >>> i) & 1)
  return bits
}

function makeCodewords(text, version) {
  const bytes = Array.from(new TextEncoder().encode(text))
  const maxData = DATA_CODEWORDS[version]
  const bits = [
    ...bitsFromNumber(0b0100, 4),
    ...bitsFromNumber(bytes.length, 8),
    ...bytes.flatMap(byte => bitsFromNumber(byte, 8)),
  ]

  const maxBits = maxData * 8
  bits.push(...new Array(Math.min(4, maxBits - bits.length)).fill(0))
  while (bits.length % 8) bits.push(0)

  const data = []
  for (let i = 0; i < bits.length; i += 8) {
    data.push(parseInt(bits.slice(i, i + 8).join(''), 2))
  }

  const pads = [0xec, 0x11]
  for (let i = 0; data.length < maxData; i += 1) data.push(pads[i % 2])
  return [...data, ...reedSolomon(data, EC_CODEWORDS[version])]
}

function makeMatrix(size) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ dark: false, reserved: false }))
  )
}

function setModule(matrix, x, y, dark, reserved = true) {
  if (matrix[y]?.[x]) matrix[y][x] = { dark, reserved }
}

function addFinder(matrix, x, y) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const xx = x + dx
      const yy = y + dy
      const inBounds = yy >= 0 && yy < matrix.length && xx >= 0 && xx < matrix.length
      if (!inBounds) continue

      const dark =
        (dx >= 0 && dx <= 6 && (dy === 0 || dy === 6)) ||
        (dy >= 0 && dy <= 6 && (dx === 0 || dx === 6)) ||
        (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)

      setModule(matrix, xx, yy, dark, true)
    }
  }
}

function addAlignment(matrix, center) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const dark = Math.max(Math.abs(dx), Math.abs(dy)) !== 1
      setModule(matrix, center + dx, center + dy, dark, true)
    }
  }
}

function addPatterns(matrix, version) {
  const size = matrix.length
  addFinder(matrix, 0, 0)
  addFinder(matrix, size - 7, 0)
  addFinder(matrix, 0, size - 7)

  for (let i = 8; i < size - 8; i += 1) {
    setModule(matrix, i, 6, i % 2 === 0, true)
    setModule(matrix, 6, i, i % 2 === 0, true)
  }

  if (version > 1) addAlignment(matrix, ALIGNMENT_POSITION[version])

  setModule(matrix, 8, size - 8, true, true)
  reserveFormat(matrix)
}

function reserveFormat(matrix) {
  const size = matrix.length
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      setModule(matrix, 8, i, false, true)
      setModule(matrix, i, 8, false, true)
    }
  }
  for (let i = 0; i < 8; i += 1) {
    setModule(matrix, size - 1 - i, 8, false, true)
    setModule(matrix, 8, size - 1 - i, false, true)
  }
}

function maskBit(x, y) {
  return (x + y) % 2 === 0
}

function placeData(matrix, codewords) {
  const bits = codewords.flatMap(byte => bitsFromNumber(byte, 8))
  const size = matrix.length
  let bitIndex = 0
  let upward = true

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1
    for (let offset = 0; offset < size; offset += 1) {
      const y = upward ? size - 1 - offset : offset
      for (let dx = 0; dx < 2; dx += 1) {
        const x = right - dx
        if (matrix[y][x].reserved) continue
        const dark = Boolean(bits[bitIndex] || 0) !== maskBit(x, y)
        setModule(matrix, x, y, dark, false)
        bitIndex += 1
      }
    }
    upward = !upward
  }
}

function addFormatBits(matrix) {
  const size = matrix.length
  const bits = bitsFromNumber(0b111011111000100, 15)
  const first = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ]
  const second = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
    [size - 5, 8], [size - 6, 8], [size - 7, 8], [8, size - 8],
    [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4],
    [8, size - 3], [8, size - 2], [8, size - 1],
  ]

  first.forEach(([x, y], index) => setModule(matrix, x, y, Boolean(bits[index]), true))
  second.forEach(([x, y], index) => setModule(matrix, x, y, Boolean(bits[index]), true))
}

function encodeQr(text) {
  const byteLength = new TextEncoder().encode(text).length
  const version = Object.entries(BYTE_CAPACITY).find(([, capacity]) => byteLength <= capacity)?.[0]
  if (!version) return null

  const numericVersion = Number(version)
  const size = 17 + numericVersion * 4
  const matrix = makeMatrix(size)
  addPatterns(matrix, numericVersion)
  placeData(matrix, makeCodewords(text, numericVersion))
  addFormatBits(matrix)
  return matrix.map(row => row.map(cell => cell.dark))
}

export default function QRCodeImage({ url, size = 160, className = '', title = 'QR code' }) {
  const matrix = useMemo(() => encodeQr(String(url || '')), [url])

  if (!matrix) {
    return (
      <div
        className={`flex items-center justify-center bg-white text-black text-xs text-center ${className}`}
        style={{ width: size, height: size }}
      >
        Link too long
      </div>
    )
  }

  const quietZone = 4
  const viewSize = matrix.length + quietZone * 2
  const squares = matrix.flatMap((row, y) =>
    row.map((dark, x) =>
      dark ? <rect key={`${x}-${y}`} x={x + quietZone} y={y + quietZone} width="1" height="1" /> : null
    )
  )

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      role="img"
      aria-label={title}
      shapeRendering="crispEdges"
    >
      <rect width={viewSize} height={viewSize} fill="#fff" />
      <g fill="#000">{squares}</g>
    </svg>
  )
}

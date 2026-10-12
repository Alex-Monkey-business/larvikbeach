// node --test tests/  (Node 24 kjører TypeScript direkte)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isKing, standings } from '../src/lib/standings.ts'

const [A, B, R, N] = ['alex', 'bard', 'roy', 'nico']
const m = (a: string[], b: string[], sa: number | null, sb: number | null, winner: 'a' | 'b' | null = sa == null || sb == null ? null : sa > sb ? 'a' : 'b') =>
  ({ team_a: a, team_b: b, score_a: sa, score_b: sb, winner, resting: [] as string[] })

// Kvelden 12. okt 2026, slik den ble ført for hånd.
const kveld = [
  m([A, B], [R, N], 21, 11),
  m([A, N], [R, B], 15, 21),
  m([A, R], [B, N], 15, 21),
  m([A, B], [R, N], 17, 21),
  m([A, N], [R, B], 21, 12),
  m([A, R], [B, N], 21, 16),
]

test('fire med roterende par er king', () => {
  assert.equal(isKing(kveld), true)
  assert.equal(isKing([m([A, B], [R, N], null, null), m([A, B], [R, N], null, null)]), false)
  assert.equal(isKing([{ ...m([A, B], [R, N], null, null), resting: ['x'] }]), true)
})

test('kvelden 12. okt: differanse først, så poeng', () => {
  const s = standings(kveld, [A, B, R, N])
  assert.deepEqual(s.map(r => [r.id, r.rank, r.diff, r.pointsFor]), [
    [A, 1, 8, 110], [B, 2, 4, 108], [N, 3, -2, 105], [R, 4, -10, 101],
  ])
})

test('seire teller ikke i king', () => {
  // Alle fire har tre seire på kvelden; rangeringen står likevel.
  const s = standings(kveld, [A, B, R, N])
  assert.deepEqual(s.map(r => r.wins), [3, 3, 3, 3])
})

test('lik differanse: flest poeng scoret vinner', () => {
  const s = standings([m([A, B], [R, N], 21, 19), m([A, R], [B, N], 10, 12), m([A, N], [B, R], 15, 15, null)], [A, B, R, N])
  // A: +2-2+0 = 0, 46. B: +2+2 = 4. R: -2-2 = -4. N: -2+2+0 = 0, 46.
  assert.deepEqual(s.map(r => [r.id, r.rank]), [[B, 1], [A, 2], [N, 2], [R, 4]])
})

test('vinner uten poeng gir ingen poeng', () => {
  const s = standings([m([A, B], [R, N], null, null, 'a'), m([A, R], [B, N], 21, 10)], [A, B, R, N])
  assert.equal(s.find(r => r.id === B)!.diff, -11)
  assert.equal(s.find(r => r.id === A)!.pointsFor, 21)
})

test('rettet resultat regner stillingen om', () => {
  const rettet = kveld.map((x, i) => i === 0 ? m([A, B], [R, N], 11, 21) : x)
  const s = standings(rettet, [A, B, R, N])
  assert.deepEqual(s.map(r => [r.id, r.diff]), [[N, 18], [R, 10], [A, -12], [B, -16]])
})

test('halv runde: stillingen står etter fire kamper', () => {
  const s = standings(kveld.slice(0, 4), [A, B, R, N])
  // A: +10 -6 -6 -4 = -6. B: +10 +6 +6 -4 = 18. R: -10 +6 -6 +4 = -6. N: -10 -6 +6 +4 = -6.
  assert.equal(s[0].id, B)
  assert.deepEqual(s.slice(1).map(r => r.rank), [2, 2, 2])
})

test('faste lag rangeres fortsatt på seire', () => {
  const [C, D] = ['c', 'd']
  const seks = [m([A, B], [R, N], 15, 14), m([A, B], [C, D], 15, 14), m([R, N], [C, D], 15, 0)]
  const s = standings(seks, [A, B, R, N, C, D])
  assert.equal(isKing(seks), false)
  assert.deepEqual(s.slice(0, 2).map(r => r.id), [A, B])
})

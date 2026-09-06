// Alle beløp lagres i øre som heltall. Kun visningen kjenner kroner.

export function kr(ore: number): string {
  const kroner = Math.round(ore / 100)
  return `${kroner.toLocaleString('nb-NO')} kr`
}

/** Hallpris delt på antall, rundet OPP til hel krone. Overskuddet er gruppas. */
export function shareOre(costOre: number, headcount: number): number {
  if (headcount <= 0) return 0
  return Math.ceil(costOre / headcount / 100) * 100
}

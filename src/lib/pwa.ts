// Melder fra at appen kjører installert, ikke i en nettleserfane.
//
// Samme form som i BenchBoss. Ligger ikke i sporing.js fordi den beaconen er
// identitetsløs med vilje og skriver til en insert-åpen tabell — en bruker-id
// der kunne hvem som helst funnet på. Dette går gjennom den innloggede
// klienten, og funksjonen i basen stempler `auth.uid()`.
import { supabase } from './supabase'

let meldt = false

// Android og desktop svarer på display-mode. iOS Safari gjør ikke det og har
// sin egen navigator.standalone. Begge må sjekkes.
export function kjorerSomApp(): boolean {
  try {
    return (
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
      ['standalone', 'fullscreen', 'minimal-ui'].some(
        (m) => window.matchMedia(`(display-mode: ${m})`).matches,
      )
    )
  } catch {
    return false
  }
}

export async function meldPwa(): Promise<void> {
  if (meldt || !kjorerSomApp()) return
  meldt = true
  try {
    const { error } = await supabase.rpc('meld_pwa')
    if (error) meldt = false
  } catch {
    meldt = false
  }
}

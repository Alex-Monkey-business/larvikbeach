// Push-varsler: be om lov, abonner hos Apple/Google, lagre abonnementet.
//
// På iPhone finnes PushManager bare i appen på hjemskjermen, ikke i en
// Safari-fane. Derfor er `stottes()` false der, og kortet på Meg blir borte.
import { supabase } from './supabase'

// Offentlig halvdel av VAPID-nøkkelparet. Den private ligger som secret på
// send-push. Byttes de, må alle slå på varsler igjen.
const VAPID_PUBLIC = 'BDLOvICakDx14gJprkAO_sBWrDHZTk2eHewMccihDNhTmp0cj46gg8Wt4EY7a-9qnJqC1w0gT9uwDfmFlYWqY1U'

export const stottes = () => typeof window !== 'undefined'
  && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function registrering() {
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

export async function erPa(): Promise<boolean> {
  const reg = await registrering()
  return Boolean(reg && await reg.pushManager.getSubscription())
}

export async function slaPa(): Promise<void> {
  const reg = await registrering()
  if (!reg) throw new Error('Appen er ikke klar for varsler ennå. Lukk og åpne den igjen.')
  // Må kalles direkte fra et trykk, ellers avviser iOS.
  const svar = await Notification.requestPermission()
  if (svar !== 'granted') throw new Error('Varsler er ikke tillatt. Det endres i Innstillinger på telefonen.')
  const sub = await reg.pushManager.getSubscription()
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: tilBytes(VAPID_PUBLIC) })
  const j = sub.toJSON()
  const { error } = await supabase.rpc('lagre_push', { p_endpoint: sub.endpoint, p_p256dh: j.keys!.p256dh, p_auth: j.keys!.auth })
  if (error) throw new Error(error.message)
}

export async function slaAv(): Promise<void> {
  const sub = await (await registrering())?.pushManager.getSubscription()
  if (!sub) return
  await supabase.rpc('fjern_push', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}

function tilBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(s.length))
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

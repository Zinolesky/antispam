/**
 * Lightweight Nigerian carrier / route detection from number prefixes.
 * Used for the carrier labels shown in the Stitch call cards.
 */
const PREFIXES: Record<string, string[]> = {
  'MTN Nigeria': ['0803', '0806', '0703', '0706', '0813', '0816', '0810', '0814', '0903', '0906', '0913', '0916', '0704', '07025', '07026'],
  'Airtel Nigeria': ['0802', '0808', '0708', '0812', '0701', '0902', '0901', '0904', '0907', '0912'],
  'Glo Nigeria': ['0805', '0807', '0705', '0815', '0811', '0905', '0915'],
  '9mobile': ['0809', '0818', '0817', '0909', '0908'],
};

/** Convert +234XXXXXXXXXX to the local 0XXXXXXXXXX form for prefix matching. */
function toLocal(num: string): string {
  const n = num.replace(/[\s\-().]/g, '');
  if (n.startsWith('+234')) return '0' + n.slice(4);
  if (n.startsWith('234') && n.length >= 13) return '0' + n.slice(3);
  return n;
}

export function isLagosVoip(num: string): boolean {
  return toLocal(num).startsWith('0201');
}

export function detectCarrier(num: string): string {
  const raw = num.replace(/[\s\-().]/g, '');
  const local = toLocal(raw);
  if (local.startsWith('0201')) return 'Lagos VoIP';
  if (local.startsWith('01') || local.startsWith('02')) return 'Nigerian Landline';
  for (const [name, list] of Object.entries(PREFIXES)) {
    if (list.some(p => local.startsWith(p))) return name;
  }
  if (raw.startsWith('+44')) return 'UK International';
  if (raw.startsWith('+1')) return 'US/CA International';
  if (raw.startsWith('+') && !raw.startsWith('+234')) return 'International';
  return 'Mobile Line';
}

/** Relative time like Stitch: "2m ago", "3h ago", "Yesterday", "2 days ago". */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

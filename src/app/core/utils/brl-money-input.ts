/** Formata valor para entrada pt-BR (sem prefixo R$). */
export function formatBrlAmountInput(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MAX_AMOUNT_CENTS = 9_007_199_254_740_991;

export function parseCentsFromDigitsString(digits: string): number {
  if (!digits) return 0;
  const capped = digits.length > 15 ? digits.slice(0, 15) : digits;
  const n = parseInt(capped, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(n, MAX_AMOUNT_CENTS);
}

export function parsePtBrAmountInput(s: string): number {
  let t = s.trim().replace(/\s/g, '').replace(/R\$/gi, '');
  if (!t || t === ',') return 0;
  if (t.endsWith(',')) t = t.slice(0, -1);
  if (t.endsWith('.')) t = t.slice(0, -1);
  if (t.includes(',')) {
    return Math.max(0, Number(t.replace(/\./g, '').replace(',', '.')) || 0);
  }
  return Math.max(0, Number(t) || 0);
}

/** Atualiza centavos a partir de evento de input (máscara POS). */
export function centsFromAmountInputEvent(ev: Event, currentCents: number): number {
  const e = ev as InputEvent;
  const input = ev.target as HTMLInputElement;

  if (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward') {
    return Math.floor(currentCents / 10);
  }
  if (e.inputType === 'insertFromPaste') {
    const raw = input.value;
    if (/[,.]/.test(raw)) {
      return Math.round(parsePtBrAmountInput(raw) * 100);
    }
    return parseCentsFromDigitsString(raw.replace(/\D/g, ''));
  }
  if (e.inputType === 'insertText' && e.data) {
    const onlyDigits = e.data.replace(/\D/g, '');
    if (onlyDigits.length === 0) return currentCents;
    if (onlyDigits.length > 1) {
      if (/[,.]/.test(e.data ?? '')) {
        return Math.round(parsePtBrAmountInput(e.data ?? '') * 100);
      }
      return parseCentsFromDigitsString(onlyDigits);
    }
    const d = parseInt(onlyDigits, 10);
    const newDigits = input.value.replace(/\D/g, '');
    const parsed = parseCentsFromDigitsString(newDigits);
    const appended = currentCents * 10 + d;
    return appended === parsed ? appended : parsed;
  }
  const raw = input.value;
  if (/[,.]/.test(raw)) {
    return Math.round(parsePtBrAmountInput(raw) * 100);
  }
  return parseCentsFromDigitsString(raw.replace(/\D/g, ''));
}

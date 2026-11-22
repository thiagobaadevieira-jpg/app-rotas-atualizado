import {Phone, X} from 'lucide-react';
import {useState} from 'react';
import type {FormEvent} from 'react';
import type {Marmoraria} from '../types.ts';

export function PhoneModal({marmoraria, onClose, onSave}: {
  marmoraria: Marmoraria;
  onClose: () => void;
  onSave: (marmoraria: Marmoraria, phone: string) => Promise<void>;
}) {
  const [phone, setPhone] = useState(marmoraria.telefone || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) {
      setError('Informe um telefone com DDD válido.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(marmoraria, phone.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o telefone.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 px-4">
      <form onSubmit={(event) => void submit(event)} role="dialog" aria-modal="true" aria-labelledby="phone-modal-title"
        className="w-full max-w-sm rounded-2xl border border-[#394539] bg-[#151a16] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="phone-modal-title" className="text-base font-bold text-[#f3f5f2]">Telefone de {marmoraria.nome}</h2>
            <p className="mt-1 text-xs text-[#9aa59c]">Será salvo no cadastro para todas as rotas.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Fechar" className="min-h-[40px] min-w-[40px] text-[#ff873f]"><X className="mx-auto h-5 w-5" /></button>
        </div>
        <label htmlFor="customer-phone" className="mt-5 block text-xs font-semibold">Telefone com DDD</label>
        <input id="customer-phone" type="tel" inputMode="tel" autoComplete="tel" autoFocus required
          value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(47) 99999-9999"
          className="mt-1.5 min-h-[46px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 text-sm focus:border-[#baff27] focus:outline-none" />
        {error && <p role="alert" className="mt-3 text-xs text-[#ff873f]">{error}</p>}
        <button type="submit" disabled={saving} className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#baff27] text-sm font-bold text-[#0d100e] disabled:opacity-60">
          <Phone className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar telefone'}
        </button>
      </form>
    </div>
  );
}

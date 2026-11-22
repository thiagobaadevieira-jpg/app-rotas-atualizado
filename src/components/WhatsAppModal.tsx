import {Edit3, ExternalLink, MessageCircle, Plus, Trash2, X} from 'lucide-react';
import {useEffect, useState} from 'react';
import type {WhatsAppTemplate} from '../types.ts';
import {buildWhatsAppUrl, normalizePhoneForWhatsApp} from '../utils/geo.ts';

interface WhatsAppModalProps {
  isOpen: boolean;
  targetName: string;
  targetPhone: string;
  templates: WhatsAppTemplate[];
  onClose: () => void;
  onSaveTemplates: (templates: WhatsAppTemplate[]) => void;
}

export function WhatsAppModal({
  isOpen,
  targetName,
  targetPhone,
  templates,
  onClose,
  onSaveTemplates,
}: WhatsAppModalProps) {
  const [selectedId, setSelectedId] = useState<string>('');
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftMessage, setDraftMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setIsCreating(false);
    setEditingTemplate(null);
    if (templates.length > 0 && !templates.some((t) => t.id === selectedId)) {
      setSelectedId(templates[0].id);
    }
  }, [isOpen, templates, selectedId]);

  if (!isOpen) return null;

  const selectedTemplate = templates.find((t) => t.id === selectedId) || templates[0] || null;
  const normalizedPhone = normalizePhoneForWhatsApp(targetPhone);

  const startCreate = () => {
    setIsCreating(true);
    setEditingTemplate(null);
    setDraftTitle('');
    setDraftMessage('');
  };

  const startEdit = (tpl: WhatsAppTemplate) => {
    setEditingTemplate(tpl);
    setIsCreating(false);
    setDraftTitle(tpl.titulo);
    setDraftMessage(tpl.mensagem);
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const title = draftTitle.trim();
    const msg = draftMessage.trim();
    if (!title || !msg) return;

    if (editingTemplate) {
      const updated = templates.map((t) =>
        t.id === editingTemplate.id ? {...t, titulo: title, mensagem: msg} : t
      );
      onSaveTemplates(updated);
      setSelectedId(editingTemplate.id);
    } else {
      const newTpl: WhatsAppTemplate = {
        id: `tpl-${Date.now()}`,
        titulo: title,
        mensagem: msg,
      };
      onSaveTemplates([...templates, newTpl]);
      setSelectedId(newTpl.id);
    }
    setEditingTemplate(null);
    setIsCreating(false);
  };

  const handleDeleteTemplate = (id: string) => {
    const next = templates.filter((t) => t.id !== id);
    onSaveTemplates(next);
    if (selectedId === id && next.length > 0) {
      setSelectedId(next[0].id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#283129] bg-[#141915] p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#f3f5f2]">Mensagens do WhatsApp</h2>
            <p className="mt-0.5 text-xs text-[#9aa59c]">
              {targetName}
              {targetPhone ? ` · ${targetPhone}` : ' · Sem telefone cadastrado'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#ff873f] hover:bg-[#ff873f]/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isCreating || editingTemplate ? (
          <form onSubmit={handleSaveTemplate} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#d5dcd4]">
                Título da mensagem
              </label>
              <input
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Ex.: Aviso de chegada"
                className="min-h-[44px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 text-sm text-[#f3f5f2] focus:border-[#baff27] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#d5dcd4]">
                Texto pré-programado
              </label>
              <textarea
                rows={4}
                value={draftMessage}
                onChange={(e) => setDraftMessage(e.target.value)}
                placeholder="Digite a mensagem que será aberta no WhatsApp..."
                className="w-full rounded-xl border border-[#29332a] bg-[#0d100e] p-3.5 text-sm text-[#f3f5f2] focus:border-[#baff27] focus:outline-none"
                required
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setEditingTemplate(null);
                }}
                className="min-h-[44px] rounded-xl border border-[#283129] px-4 text-xs font-semibold text-[#d5dcd4]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-[#baff27] px-4 text-xs font-bold text-[#0d100e]"
              >
                Salvar mensagem
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#d5dcd4]">
                Escolha uma mensagem pré-programada
              </span>
              <button
                type="button"
                onClick={startCreate}
                className="inline-flex min-h-[38px] items-center gap-1.5 text-xs font-bold text-[#baff27] hover:underline"
              >
                <Plus className="h-4 w-4" />
                <span>Nova mensagem</span>
              </button>
            </div>

            {templates.length === 0 ? (
              <p className="rounded-xl border border-[#242c25] bg-[#0d100e] p-4 text-center text-xs text-[#9aa59c]">
                Nenhuma mensagem salva. Crie sua primeira mensagem acima.
              </p>
            ) : (
              <ul className="space-y-2">
                {templates.map((tpl) => {
                  const isSelected = tpl.id === selectedTemplate?.id;
                  return (
                    <li
                      key={tpl.id}
                      className={`rounded-2xl border p-3 transition-colors ${
                        isSelected
                          ? 'border-[#baff27]/60 bg-[#182118]'
                          : 'border-[#242c25] bg-[#0d100e]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedId(tpl.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p
                            className={`text-sm font-bold ${
                              isSelected ? 'text-[#baff27]' : 'text-[#f3f5f2]'
                            }`}
                          >
                            {tpl.titulo}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-[#9aa59c]">
                            {tpl.mensagem}
                          </p>
                        </button>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(tpl)}
                            aria-label={`Editar ${tpl.titulo}`}
                            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-[#9aa59c] hover:bg-[#1e251f] hover:text-[#f3f5f2]"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(tpl.id)}
                            aria-label={`Excluir ${tpl.titulo}`}
                            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-[#9aa59c] hover:bg-[#1e251f] hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {!normalizedPhone ? (
              <p className="rounded-xl border border-[#ff873f]/40 bg-[#ff873f]/10 px-3.5 py-2.5 text-xs text-[#ff873f]">
                Esta marmoraria ainda não possui um número de telefone válido cadastrado.
              </p>
            ) : (
              <a
                href={buildWhatsAppUrl(targetPhone, selectedTemplate?.mensagem || '')}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#baff27] px-4 py-3 text-sm font-bold text-[#0d100e] transition-transform active:scale-[0.98]"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Abrir conversa no WhatsApp</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import {Check, Link2, LocateFixed, X} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import type {Coordinates, Marmoraria} from '../types.ts';
import {
  formatCoordinates,
  isGoogleMapsUrl,
  isValidCoordinates,
  parseCoordinatesInput,
} from '../utils/geo.ts';
import {AppMap} from './AppMap.tsx';

interface MarmorariaModalProps {
  isOpen: boolean;
  initialData?: Marmoraria | null;
  initialCoords?: Coordinates | null;
  initialName?: string;
  initialMapPickerOpen?: boolean;
  shareNotice?: string | null;
  userPosition?: Coordinates | null;
  onClose: () => void;
  onSave: (data: {
    id?: string;
    nome: string;
    cidade: string;
    telefone: string;
    lat: number;
    lng: number;
  }) => void;
}

export function MarmorariaModal({
  isOpen,
  initialData,
  initialCoords,
  initialName,
  initialMapPickerOpen = false,
  shareNotice,
  userPosition,
  onClose,
  onSave,
}: MarmorariaModalProps) {
  const [nome, setNome] = useState('');
  const [cidade, setCidade] = useState('');
  const [telefone, setTelefone] = useState('');
  const [coordsInput, setCoordsInput] = useState('');
  const [pickedCoords, setPickedCoords] = useState<Coordinates | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvingLink, setResolvingLink] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const locationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopLocating = () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (locationTimerRef.current !== null) clearTimeout(locationTimerRef.current);
    watchIdRef.current = null;
    locationTimerRef.current = null;
    setLocating(false);
  };

  useEffect(() => () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (locationTimerRef.current !== null) clearTimeout(locationTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isOpen) {stopLocating(); return;}
    setError(null);
    setLocating(false);
    setLocationAccuracy(null);
    if (initialData) {
      setNome(initialData.nome);
      setCidade(initialData.cidade);
      setTelefone(initialData.telefone);
      const c = {lat: initialData.lat, lng: initialData.lng};
      setPickedCoords(c);
      setCoordsInput(formatCoordinates(c.lat, c.lng));
      setShowMapPicker(initialMapPickerOpen);
    } else {
      setNome(initialName || '');
      setCidade('');
      setTelefone('');
      if (initialCoords && isValidCoordinates(initialCoords.lat, initialCoords.lng)) {
        setPickedCoords(initialCoords);
        setCoordsInput(formatCoordinates(initialCoords.lat, initialCoords.lng));
      } else {
        setPickedCoords(null);
        setCoordsInput('');
      }
      setShowMapPicker(initialMapPickerOpen);
    }
  }, [isOpen, initialData, initialCoords, initialName, initialMapPickerOpen]);

  if (!isOpen) return null;

  const handleCoordsChange = async (value: string) => {
    if (watchIdRef.current !== null) stopLocating();
    setCoordsInput(value);
    setLocationAccuracy(null);
    setError(null);

    const direct = parseCoordinatesInput(value);
    if (direct) {
      setPickedCoords(direct);
      return;
    }

    if (isGoogleMapsUrl(value)) {
      setResolvingLink(true);
      try {
        const res = await fetch('/api/maps/resolve-link', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({url: value.trim()}),
        });
        const data = (await res.json()) as {
          coordinates?: Coordinates | null;
          error?: string;
        };
        if (data.coordinates && isValidCoordinates(data.coordinates.lat, data.coordinates.lng)) {
          setPickedCoords(data.coordinates);
          setCoordsInput(formatCoordinates(data.coordinates.lat, data.coordinates.lng));
        } else {
          setError(
            'N�o foi poss�vel extrair coordenadas desse link. Cole as coordenadas manualmente (ex.: -26.460149, -48.906940) ou marque no mapa.'
          );
        }
      } catch {
        setError('Falha ao ler link do Google Maps. Cole as coordenadas ou marque no mapa.');
      } finally {
        setResolvingLink(false);
      }
    }
  };

  const handleMapPick = (coords: Coordinates) => {
    if (watchIdRef.current !== null) stopLocating();
    setPickedCoords(coords);
    setCoordsInput(formatCoordinates(coords.lat, coords.lng));
    setLocationAccuracy(null);
    setError(null);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Este navegador n�o oferece acesso � localiza��o.');
      return;
    }
    stopLocating();
    setLocating(true);
    setError(null);
    setLocationAccuracy(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const accuracy = Math.round(position.coords.accuracy);
        setLocationAccuracy(accuracy);
        if (!Number.isFinite(accuracy) || accuracy > 50) return;
        const coords = {lat: position.coords.latitude, lng: position.coords.longitude};
        if (!isValidCoordinates(coords.lat, coords.lng)) return;
        stopLocating();
        setPickedCoords(coords);
        setCoordsInput(formatCoordinates(coords.lat, coords.lng));
        setShowMapPicker(true);
      },
      (locationError) => {
        stopLocating();
        setError(locationError.code === 1
          ? 'Permita o acesso � localiza��o no navegador para usar o ponto atual.'
          : 'N�o foi poss�vel obter sua localiza��o. Tente novamente em um local com sinal de GPS.');
      },
      {enableHighAccuracy: true, maximumAge: 0, timeout: 20000}
    );
    locationTimerRef.current = setTimeout(() => {
      stopLocating();
      setError('A localiza��o recebida n�o foi precisa o suficiente. Use o GPS do celular em local aberto ou marque o ponto manualmente no mapa.');
    }, 21000);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = nome.trim();
    const trimmedCity = cidade.trim();
    const parsed = parseCoordinatesInput(coordsInput) || pickedCoords;

    if (trimmedName.length < 2) {
      setError('Informe o nome da marmoraria.');
      return;
    }
    if (trimmedCity.length < 2) {
      setError('Informe a cidade.');
      return;
    }
    if (!parsed || !isValidCoordinates(parsed.lat, parsed.lng)) {
      setError(
        'Coordenadas inv�lidas. Cole no formato "-26.460149, -48.906940" ou marque um ponto no mapa.'
      );
      return;
    }

    onSave({
      id: initialData?.id,
      nome: trimmedName,
      cidade: trimmedCity,
      telefone: telefone.trim(),
      lat: parsed.lat,
      lng: parsed.lng,
    });
    onClose();
  };

  return (
    <div className="app-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-[#283129] bg-[#141915] p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[#f3f5f2]">
            {initialData ? 'Editar marmoraria' : 'Cadastrar marmoraria'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#ff873f] hover:bg-[#ff873f]/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {shareNotice && (
          <div className="mt-3 rounded-xl border border-[#ff873f]/40 bg-[#ff873f]/10 px-3.5 py-2.5 text-xs leading-relaxed text-[#ff873f]">
            {shareNotice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#d5dcd4]">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Marmoraria Central"
              className="min-h-[46px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 text-sm text-[#f3f5f2] placeholder-[#5d6b5f] focus:border-[#baff27] focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#d5dcd4]">Cidade</label>
              <input
                type="text"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                placeholder="Ex.: Joinville"
                className="min-h-[46px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 text-sm text-[#f3f5f2] placeholder-[#5d6b5f] focus:border-[#baff27] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#d5dcd4]">
                Telefone / WhatsApp
              </label>
              <input
                type="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="Ex.: (47) 99999-0000"
                className="min-h-[46px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 text-sm text-[#f3f5f2] placeholder-[#5d6b5f] focus:border-[#baff27] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5">
              <label className="text-xs font-semibold text-[#d5dcd4]">
                Coordenadas (latitude, longitude ou link do Google Maps)
              </label>
            </div>

            <div className="relative">
              <input
                type="text"
                value={coordsInput}
                onChange={(e) => void handleCoordsChange(e.target.value)}
                placeholder="-26.46014955195992, -48.90694063491616"
                className="min-h-[46px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] pr-10 pl-3.5 font-mono text-xs text-[#f3f5f2] placeholder-[#5d6b5f] focus:border-[#baff27] focus:outline-none sm:text-sm"
              />
              {resolvingLink ? (
                <Link2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-[#baff27]" />
              ) : (
                pickedCoords && (
                  <Check className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-[#baff27]" />
                )
              )}
            </div>
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={locating}
              className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#baff27]/50 bg-[#baff27]/10 px-3.5 text-xs font-bold text-[#baff27] hover:bg-[#baff27]/20 disabled:cursor-wait disabled:opacity-60"
            >
              <LocateFixed className={`h-4 w-4 ${locating ? 'animate-pulse' : ''}`} />
              {locating ? 'Obtendo localiza��o...' : 'Localiza��o atual'}
            </button>
            {locationAccuracy !== null && (
              <p role="status" className="mt-1.5 text-[11px] text-[#9aa59c]">
                {locating ? `Aguardando GPS mais preciso (leitura atual: �${locationAccuracy} m)...` : `Coordenadas do GPS (precis�o aproximada: �${locationAccuracy} m). Confira o ponto antes de salvar.`}
              </p>
            )}
            <p className="mt-1 text-[11px] text-[#7b877e]">
              Aceita latitude e longitude coladas juntas ou links longos/curtos do Google Maps.
            </p>
          </div>

          {showMapPicker && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[#baff27]">
                Toque no mapa para definir o ponto exato da marmoraria:
              </p>
              <AppMap
                mode="pick"
                pickedPosition={pickedCoords}
                userPosition={userPosition}
                onPickCoordinates={handleMapPick}
                className="h-56 w-full"
              />
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[46px] rounded-xl border border-[#283129] px-4 text-sm font-semibold text-[#d5dcd4]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={resolvingLink}
              className="min-h-[46px] rounded-xl bg-[#baff27] px-5 text-sm font-bold text-[#0d100e] disabled:opacity-50"
            >
              {initialData ? 'Salvar altera��es' : 'Salvar marmoraria'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


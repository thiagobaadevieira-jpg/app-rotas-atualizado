import {useState} from 'react';
import type {FormEvent} from 'react';
import {supabase} from '../lib/supabase.ts';

interface Props {
  onLogin: () => void;
}

export function LoginScreen({onLogin}: Props) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!supabase) {setError('Supabase não configurado neste ambiente.'); return;}
    const username = name.trim().toLowerCase();
    const email = username.includes('@') ? username : `${username}@italik.com`;
    setBusy(true);
    setError('');
    const {error: signInError} = await supabase.auth.signInWithPassword({email, password});
    setBusy(false);
    if (signInError) setError('Nome ou senha incorretos.');
    else onLogin();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d100e] px-4 text-[#f3f5f2]">
      <form onSubmit={(event) => void signIn(event)} className="w-full max-w-sm rounded-2xl border border-[#2b352c] bg-[#151a16] p-6 shadow-2xl">
        <h1 className="text-center text-2xl font-extrabold">Rota <span className="text-[#baff27]">Italik</span></h1>
        <p className="mt-2 text-center text-sm text-[#9aa59c]">Entre com seu nome e senha</p>
        <label className="mt-6 block text-sm font-medium">Nome
          <input autoComplete="username" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome de acesso" className="mt-2 min-h-[46px] w-full rounded-xl border border-[#394539] bg-[#0d100e] px-3.5 text-[#f3f5f2] outline-none focus:border-[#baff27]" />
        </label>
        <label className="mt-4 block text-sm font-medium">Senha
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 min-h-[46px] w-full rounded-xl border border-[#394539] bg-[#0d100e] px-3.5 text-[#f3f5f2] outline-none focus:border-[#baff27]" />
        </label>
        {error && <p role="alert" className="mt-3 text-sm text-[#ff873f]">{error}</p>}
        <button disabled={busy} type="submit" className="mt-6 min-h-[48px] w-full rounded-xl bg-[#baff27] px-4 font-bold text-[#0d100e] disabled:opacity-60">{busy ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </div>
  );
}
